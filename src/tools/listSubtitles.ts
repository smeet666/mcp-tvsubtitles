/**
 * The tool that reads what a show holds.
 *
 * It answers in one of two shapes, and 'kind' says which. Naming a season alone
 * reads that season's coverage in one request: which episodes exist and which
 * languages hold something for each. Naming an episode as well reads the records
 * themselves. The two are declared as a union rather than folded into one shape,
 * because a coverage row and a subtitle record are not the same claim.
 *
 * Reading every episode's records to answer a season would cost one request per
 * episode on a queue every other tool waits behind, which is why the season
 * answers coverage rather than records.
 */

import { z } from "zod";
import { TvSubtitlesError } from "../errors.js";
import type { SubtitleRecord, TvSubtitlesClient } from "../tvsubtitles/client.js";
import { requireLanguage } from "../tvsubtitles/client.js";
import { languageBySiteCode } from "../tvsubtitles/languages.js";
import { refusalMessage, strictInput } from "./arguments.js";
import { ok, READS_CATALOGUE_ONLY, SOURCE_NAME, type ToolResult } from "./shared.js";
import { subtitleRowSchema, toSubtitleRow } from "./subtitleRow.js";

export const listSubtitlesDescription =
  "List what tvsubtitles.net holds for one series. Pass 'id' from search_titles. With 'season' alone " +
  "the answer is that season's coverage, one row per episode saying which languages hold something, " +
  "and 'kind' reads 'coverage'. Add 'episode' and the answer is the subtitle records themselves, with " +
  "'kind' reading 'subtitles'. Leaving 'season' out reads the newest season, and the answer says which " +
  "one that was. This server reads the catalogue: each record carries the page to open to download it.";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;

export const listSubtitlesInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .describe("A show id from search_titles. The site answers an id it does not hold with a page."),
  season: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Leave it out to read the newest season. The answer states which season it read."),
  episode: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Name an episode to read its subtitle records rather than the season's coverage."),
  language: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .describe(
      "A language from list_languages, by its name, the site's two-letter code, or its BCP 47 tag. " +
        "Left out, every language comes back.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Rows to render, ${DEFAULT_LIMIT} by default and ${MAX_LIMIT} at most.`),
} as const;

export const listSubtitlesArgs = strictInput(listSubtitlesInput);
export type ListSubtitlesArgs = z.infer<typeof listSubtitlesArgs>;

const coverageRowSchema = z.object({
  episode: z.number().int(),
  episode_id: z.string().describe("The site's own id for the episode."),
  title: z.string(),
  subtitle_count: z
    .number()
    .int()
    .nullable()
    .describe("What the site counts for this episode. Null where it printed nothing."),
  languages: z.array(z.string()).describe("The languages holding something for this episode."),
  url: z.string(),
});

const commonShape = {
  id: z.string(),
  show_name: z.string(),
  season: z.number().int().describe("The season the site served, which it states on the page."),
  season_requested: z
    .number()
    .int()
    .nullable()
    .describe("The season that was asked for, or null when the newest was asked for."),
  seasons_available: z.array(z.number().int()),
  result_count: z.number().int(),
  total_available: z.number().int(),
  filters_applied: z.array(z.string()),
  filters_dropped: z.array(z.string()),
  cached: z.boolean(),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

/**
 * Two shapes, declared as a union.
 *
 * A schema describing only one of them would be optimistic about the other, and
 * a caller reading it would expect records where a coverage row is all the
 * answer holds.
 */
export const listSubtitlesOutputShape = {
  ...commonShape,
  kind: z.enum(["coverage", "subtitles"]).describe("Which shape 'results' takes."),
  episode: z.number().int().nullable().describe("The episode read, or null for a season."),
  total_counts: z
    .enum(["episodes_in_season", "rows_served"])
    .describe(
      "What 'total_available' counted: the episodes of a season, or the records one episode held.",
    ),
  results: z
    .union([z.array(coverageRowSchema), z.array(subtitleRowSchema)])
    .describe("Coverage rows when 'kind' is 'coverage', subtitle records when it is 'subtitles'."),
} as const;

/**
 * What a page said about the seasons a show holds.
 *
 * A page naming none says nothing, and enumerating an empty list would put a
 * sentence with nothing in it in front of a reader.
 */
const seasonsHeld = (seasons: readonly number[]): string => {
  if (seasons.length === 0) {
    return "Its page names no season, so nothing here says which it holds.";
  }
  return `It holds ${seasons.length === 1 ? "season" : "seasons"} ${seasons.join(", ")}.`;
};

const showIdOf = (raw: string): number => {
  const id = Number.parseInt(raw, 10);
  if (!(Number.isSafeInteger(id) && id > 0 && String(id) === raw.trim())) {
    throw new TvSubtitlesError(
      "invalid_input",
      `'id' was given '${raw}', which is not a show id from search_titles.`,
      {
        hint: "Ids are whole numbers and come back from search_titles.",
      },
    );
  }
  return id;
};

export async function runListSubtitles(
  client: TvSubtitlesClient,
  args: ListSubtitlesArgs,
): Promise<ToolResult> {
  const parsed = listSubtitlesArgs.safeParse(args);
  if (!parsed.success) {
    throw new TvSubtitlesError("invalid_input", refusalMessage(parsed.error.issues));
  }

  const showId = showIdOf(parsed.data.id);
  // Resolved before anything is read. A language this site does not hold is a
  // refusal of an argument, and a refusal costs the site no request.
  const language =
    parsed.data.language === undefined ? undefined : requireLanguage(parsed.data.language);

  const requested = parsed.data.season ?? null;
  // Season 0 is how the site is asked for its newest season.
  const read = await client.getSeason(showId, requested ?? 0);
  const page = read.data;
  const notes: string[] = [];

  if (requested !== null && page.season !== requested) {
    notes.push(
      `The site served season ${page.season} for a request naming season ${requested}. ${seasonsHeld(page.seasonsAvailable)}`,
    );
  }
  if (requested === null) {
    notes.push(
      `No season was named, so the newest one the site holds was read: season ${page.season}.`,
    );
  }
  if (page.episodes.length === 0) {
    notes.push(
      `The site published this season's page and listed no episodes on it, which is what it answered rather than a failure to read it. ${seasonsHeld(page.seasonsAvailable)}`,
    );
  }

  const applied = language ? [`language=${language.name}`] : [];
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  return parsed.data.episode === undefined
    ? coverage(page, { read, notes, applied, limit, language: language?.siteCode, requested })
    : records(client, page, {
        episode: parsed.data.episode,
        notes,
        applied,
        limit,
        language,
        requested,
        cached: read.cached,
      });
}

type SeasonRead = Awaited<ReturnType<TvSubtitlesClient["getSeason"]>>;

function coverage(
  page: SeasonRead["data"],
  context: {
    read: SeasonRead;
    notes: string[];
    applied: string[];
    limit: number;
    language: string | undefined;
    requested: number | null;
  },
): ToolResult {
  const { notes, applied, limit, language, requested } = context;
  const dropped: string[] = [];

  // A language that empties the season is set aside rather than reported as an
  // absence: the season exists, and narrowing it is what came back with nothing.
  let episodes = page.episodes;
  if (language !== undefined) {
    const narrowed = episodes.filter((row) =>
      row.languages.some((held) => held.siteCode === language),
    );
    if (narrowed.length > 0) {
      episodes = narrowed;
    } else {
      dropped.push(...applied.splice(0));
      notes.push(
        `No episode of season ${page.season} holds a subtitle in that language, so the language was set aside and every episode is shown.`,
      );
    }
  }

  const rendered = episodes.slice(0, limit);
  if (rendered.length < episodes.length) {
    notes.push(
      `${rendered.length} of the ${episodes.length} episodes are rendered here. Raise 'limit' for the rest.`,
    );
  }
  // The client counts what it could not read on every route; saying so is the
  // tool's part, and without it a total naming episodes counts only the
  // readable ones while reading as though it counted them all.
  const unread = context.read.skipped ?? 0;
  if (unread > 0) {
    notes.push(
      `${unread} ${unread === 1 ? "row of this season's table was" : "rows of this season's table were"} written too incompletely to read, so ${unread === 1 ? "one episode is" : "those episodes are"} missing from what follows and from the total beside it.`,
    );
  }
  notes.push(
    "These rows say which languages hold something, not what each file is. Name an 'episode' to read its records.",
  );

  const results = rendered.map((row) => ({
    episode: row.episode,
    episode_id: String(row.episodeId),
    title: row.title,
    subtitle_count: row.amount,
    languages: row.languages.map((held) => held.language),
    url: `https://www.tvsubtitles.net/episode-${row.episodeId}.html`,
  }));

  const body =
    results.length === 0
      ? `tvsubtitles.net lists no episodes for ${page.showName} season ${page.season}.`
      : [
          `${page.showName}, season ${page.season}.`,
          ...results.map(
            (row) =>
              `${page.season}x${String(row.episode).padStart(2, "0")} ${row.title} — ${row.subtitle_count ?? "?"} subtitles in ${row.languages.length} languages`,
          ),
        ].join("\n");

  return ok(
    {
      id: String(page.showId),
      show_name: page.showName,
      season: page.season,
      season_requested: requested,
      seasons_available: page.seasonsAvailable,
      kind: "coverage" as const,
      episode: null,
      results,
      result_count: results.length,
      total_available: episodes.length,
      total_counts: "episodes_in_season" as const,
      filters_applied: applied,
      filters_dropped: dropped,
      cached: context.read.cached,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}

/**
 * The records one episode holds, honouring a language when one was named.
 *
 * Two things decide what comes back. A narrowing that fails is set aside
 * exactly like one that comes back empty, because a filter cannot manufacture
 * an absence and the failure of a page this server chose to read is not an
 * answer about the episode. And what the answer says about a language is
 * decided on the rows themselves: the site's page for a language is trusted for
 * the rows it holds, never for the question it was given, so no row of another
 * language is rendered under a filter naming this one.
 */
async function readEpisode(
  client: TvSubtitlesClient,
  episodeId: number,
  language: ReturnType<typeof requireLanguage> | undefined,
  seasonCached: boolean,
): Promise<{
  rows: SubtitleRecord[];
  skipped: number;
  fromMemory: boolean;
  narrowingFailed: boolean;
  setAside: boolean;
  notes: string[];
}> {
  const notes: string[] = [];
  let rows: SubtitleRecord[] = [];
  let skipped = 0;
  let narrowingFailed = false;
  // True only while every page this needed came from memory.
  let fromMemory = seasonCached;

  if (language) {
    try {
      const narrowed = await client.listEpisodeSubtitles(episodeId, language);
      skipped += narrowed.skipped ?? 0;
      fromMemory &&= narrowed.cached;
      rows = narrowed.data.filter((record) => record.siteCode === language.siteCode);
    } catch {
      narrowingFailed = true;
    }
  } else {
    const whole = await client.listEpisodeSubtitles(episodeId);
    skipped += whole.skipped ?? 0;
    fromMemory &&= whole.cached;
    rows = whole.data;
  }

  if (!language || rows.length > 0) {
    return { rows, skipped, fromMemory, narrowingFailed, setAside: false, notes };
  }

  // Read again without the narrowing. A failure here is the episode's own page
  // failing, which is an answer about the episode and is reported.
  const whole = await client.listEpisodeSubtitles(episodeId);
  skipped += whole.skipped ?? 0;
  fromMemory &&= whole.cached;
  const held = whole.data.filter((record) => record.siteCode === language.siteCode);

  if (held.length > 0) {
    notes.push(
      `The site's page for that language ${narrowingFailed ? "could not be read" : "came back empty"} while the episode's own page holds ${held.length === 1 ? "a subtitle" : "subtitles"} in it. These were read from the episode's page.`,
    );
    return { rows: held, skipped, fromMemory, narrowingFailed, setAside: false, notes };
  }

  if (whole.data.length === 0) {
    return { rows, skipped, fromMemory, narrowingFailed, setAside: false, notes };
  }

  notes.push(
    `This episode holds no subtitle in that language${narrowingFailed ? ", whose page could not be read either" : ""}, so the language was set aside and every language is shown.`,
  );
  return { rows: whole.data, skipped, fromMemory, narrowingFailed, setAside: true, notes };
}

async function records(
  client: TvSubtitlesClient,
  page: SeasonRead["data"],
  context: {
    episode: number;
    notes: string[];
    applied: string[];
    limit: number;
    language: ReturnType<typeof requireLanguage> | undefined;
    requested: number | null;
    cached: boolean;
  },
): Promise<ToolResult> {
  const { episode, notes, applied, limit, language, requested } = context;
  const row = page.episodes.find((candidate) => candidate.episode === episode);
  if (!row) {
    throw new TvSubtitlesError(
      "not_found",
      `tvsubtitles.net lists no episode ${episode} in season ${page.season} of ${page.showName}.`,
      {
        hint: `That season holds episodes ${page.episodes.map((each) => each.episode).join(", ") || "none"}.`,
      },
    );
  }

  const read = await readEpisode(client, row.episodeId, language, context.cached);
  const { rows, skipped, fromMemory, narrowingFailed } = read;
  const dropped: string[] = [];
  notes.push(...read.notes);
  if (read.setAside) {
    dropped.push(...applied.splice(0));
  }
  if (skipped > 0) {
    notes.push(
      `${skipped} ${skipped === 1 ? "block" : "blocks"} of this episode's page named no record and could not be read, so ${skipped === 1 ? "it is" : "they are"} missing from what follows.`,
    );
  }

  const rendered = rows.slice(0, limit);
  if (rendered.length < rows.length) {
    notes.push(
      `${rendered.length} of the ${rows.length} records this episode holds are rendered here. Raise 'limit' for the rest.`,
    );
  }
  notes.push(READS_CATALOGUE_ONLY);

  const results = rendered.map((record) =>
    toSubtitleRow(record, {
      showId: page.showId,
      season: page.season,
      episode,
      readFrom: "listing",
    }),
  );

  const body =
    results.length === 0
      ? `tvsubtitles.net holds no subtitles for ${page.showName} ${page.season}x${episode}.`
      : [
          `${page.showName} ${page.season}x${String(episode).padStart(2, "0")}${row.title ? ` "${row.title}"` : ""}.`,
          ...results.map(
            (each) =>
              `${each.id}: ${each.language}${each.releases.length > 0 ? ` (${each.releases.join(", ")})` : ""} — ${each.downloads ?? "?"} downloads`,
          ),
        ].join("\n");

  return ok(
    {
      id: String(page.showId),
      show_name: page.showName,
      season: page.season,
      season_requested: requested,
      seasons_available: page.seasonsAvailable,
      kind: "subtitles" as const,
      episode,
      results,
      result_count: results.length,
      total_available: rows.length,
      total_counts: "rows_served" as const,
      filters_applied: applied,
      filters_dropped: dropped,
      cached: fromMemory && !narrowingFailed,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}

/** Kept beside the tool so a coverage row can name a language the site drew. */
export const languageNameOf = (siteCode: string): string | null =>
  languageBySiteCode(siteCode)?.name ?? null;
