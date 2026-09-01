/**
 * The tool that publishes the languages the site holds.
 *
 * It exists because the site names its languages its own way and answers a name
 * it does not know with nothing rather than with a refusal. A caller who guesses
 * a spelling would read that as the site holding no subtitles in that language,
 * which is an absence nobody established. Publishing the list is what makes the
 * question askable.
 */

import { z } from "zod";
import { TvSubtitlesError } from "../errors.js";
import type { TvSubtitlesClient } from "../tvsubtitles/client.js";
import { LANGUAGES } from "../tvsubtitles/languages.js";
import { refusalMessage, strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const listLanguagesDescription =
  "List the languages tvsubtitles.net catalogues subtitles in. Called without arguments it returns the " +
  "twenty-four the catalogue holds. Pass a show id from search_titles to read the languages that show " +
  "actually holds, measured over one season and counted in episodes. Each entry carries the name the " +
  "site prints, the two-letter code it addresses the language by, and the BCP 47 tag where that " +
  "mapping is certain. Six of the site's codes differ from ISO 639-1 and one of them collides: the " +
  "site writes 'br' for Brazilian Portuguese, which ISO assigns to Breton. Read this before narrowing " +
  "list_subtitles by language.";

export const listLanguagesInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .optional()
    .describe(
      "A show id from search_titles, to read what that show holds rather than what the catalogue " +
        "does. Left out, the whole catalogue's languages come back.",
    ),
  season: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Which season to measure a show's languages over. Left out, the newest season is read. Ignored " +
        "without 'id', because the catalogue has no season.",
    ),
} as const;

export const listLanguagesArgs = strictInput(listLanguagesInput);
export type ListLanguagesArgs = z.infer<typeof listLanguagesArgs>;

export const listLanguagesOutputShape = {
  languages: z.array(
    z.object({
      name: z.string().describe("The name the site prints, which list_subtitles accepts."),
      site_code: z.string().describe("The code the site addresses this language by."),
      code: z
        .string()
        .nullable()
        .describe("BCP 47, where the mapping is certain. Null where it is not."),
      differs_from_iso: z
        .boolean()
        .describe("True where the site's own code is not the ISO 639-1 one for this language."),
      count: z
        .number()
        .int()
        .nullable()
        .describe(
          "Episodes of the season read that hold this language. Null for the catalogue, which " +
            "publishes no per-language count this server can name.",
        ),
    }),
  ),
  language_count: z.number().int(),
  scope: z
    .enum(["catalogue", "season"])
    .describe(
      "'catalogue' is every language the site catalogues, whatever any show holds. 'season' is what " +
        "one season of one show holds, which is what was measured when 'id' was passed.",
    ),
  show_id: z.string().nullable(),
  show_name: z.string().nullable(),
  season: z
    .number()
    .int()
    .nullable()
    .describe("The season measured, which the site states on the page it served."),
  cached: z.boolean(),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

/**
 * What a page said about the seasons a show holds, and what that means here.
 *
 * A show with one season has no other for a reader to go looking through, and a
 * page naming none says nothing worth enumerating.
 */
const seasonsHeld = (seasons: readonly number[]): string => {
  if (seasons.length === 0) {
    return "Its page names no season, so nothing here says which others it holds.";
  }
  if (seasons.length === 1) {
    return "This show holds one season.";
  }
  return `This show holds seasons ${seasons.join(", ")}, and another season may hold languages this one does not.`;
};

const CATALOGUE_NOTE =
  "These are the languages the site catalogues, whatever any one show holds. Pass a show id to read what a show holds.";

/**
 * The note naming the codes of this answer that are not the ISO ones.
 *
 * Null where none of them is, because a note announcing none and enumerating
 * nothing tells a reader something the answer does not hold.
 */
function isoNote(languages: readonly { site_code: string; code: string | null }[]): string | null {
  const differing = languages.filter(
    (language) => language.code !== null && language.code.split("-")[0] !== language.site_code,
  );
  if (differing.length === 0) {
    return null;
  }
  return `${differing.length === 1 ? "One of" : `${differing.length} of`} the site's codes differ${differing.length === 1 ? "s" : ""} from ISO 639-1: ${differing
    .map((language) => `${language.site_code} is ${language.code}`)
    .join(", ")}.`;
}

const catalogue = () =>
  LANGUAGES.map((language) => ({
    name: language.name,
    site_code: language.siteCode,
    code: language.code,
    differs_from_iso: language.code !== null && language.code.split("-")[0] !== language.siteCode,
    count: null as number | null,
  }));

export async function runListLanguages(
  client: TvSubtitlesClient,
  args: ListLanguagesArgs,
): Promise<ToolResult> {
  const parsed = listLanguagesArgs.safeParse(args);
  if (!parsed.success) {
    throw new TvSubtitlesError("invalid_input", refusalMessage(parsed.error.issues));
  }

  return parsed.data.id === undefined
    ? wholeCatalogue()
    : await oneShow(client, parsed.data.id, parsed.data.season);
}

function wholeCatalogue(): ToolResult {
  const languages = catalogue();
  const divergences = isoNote(languages);
  const notes = divergences === null ? [CATALOGUE_NOTE] : [CATALOGUE_NOTE, divergences];
  const body = [
    "Languages tvsubtitles.net catalogues subtitles in.",
    ...languages.map(
      (language) =>
        `${language.name} (site code ${language.site_code}, tag ${language.code ?? "none"})`,
    ),
  ].join("\n");

  return ok(
    {
      languages,
      language_count: languages.length,
      scope: "catalogue" as const,
      show_id: null,
      show_name: null,
      season: null,
      cached: false,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}

async function oneShow(
  client: TvSubtitlesClient,
  rawId: string,
  season: number | undefined,
): Promise<ToolResult> {
  const showId = Number.parseInt(rawId, 10);
  if (!(Number.isSafeInteger(showId) && showId > 0 && String(showId) === rawId.trim())) {
    throw new TvSubtitlesError("invalid_input", `'${rawId}' is not a show id from search_titles.`, {
      hint: "Ids are whole numbers and come back from search_titles.",
    });
  }

  // Season 0 is how the site is asked for its newest season.
  const read = await client.getSeason(showId, season ?? 0);
  const page = read.data;

  // Counted in episodes rather than in files: an episode row says which
  // languages hold something for it and not how many files each holds, so a
  // count of files here would be a number nobody read off the page.
  const held = new Map<string, number>();
  for (const episode of page.episodes) {
    for (const language of episode.languages) {
      held.set(language.siteCode, (held.get(language.siteCode) ?? 0) + 1);
    }
  }

  const languages = catalogue()
    .filter((language) => held.has(language.site_code))
    .map((language) => ({ ...language, count: held.get(language.site_code) ?? null }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name));

  // The warning about other seasons is written only where there are others: a
  // show holding one season has none for a reader to go looking through.
  const holds = seasonsHeld(page.seasonsAvailable);
  const notes = [
    `Measured over season ${page.season}, the ${season === undefined ? "newest season the site holds" : "season asked for"}. ${holds}`,
    "A count is episodes of that season holding the language, not files: an episode row says which languages hold something and not how many files each one holds.",
  ];
  // A count of episodes is only as whole as the season it was counted over.
  const unread = read.skipped ?? 0;
  if (unread > 0) {
    notes.push(
      `${unread} ${unread === 1 ? "row of this season's table was" : "rows of this season's table were"} written too incompletely to read, so every count below is measured over the episodes that could be read rather than over the whole season.`,
    );
  }
  const divergences = languages.length > 0 ? isoNote(languages) : null;
  if (divergences !== null) {
    notes.push(divergences);
  }

  const body =
    languages.length === 0
      ? `tvsubtitles.net holds no subtitles in any language for ${page.showName} season ${page.season}.`
      : [
          `Languages held for ${page.showName}, season ${page.season}.`,
          ...languages.map(
            (language) =>
              `${language.name} (site code ${language.site_code}) — ${language.count} of ${page.episodes.length} episodes`,
          ),
        ].join("\n");

  return ok(
    {
      languages,
      language_count: languages.length,
      scope: "season" as const,
      show_id: String(page.showId),
      show_name: page.showName,
      season: page.season,
      cached: read.cached,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}
