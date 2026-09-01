/**
 * The tool that finds a show, which is where every other question starts.
 *
 * The site holds no address that carries a query, so it is asked through its
 * own form. Ids come back from here and are never assembled by hand: the site
 * answers an id it does not hold with a page rather than with a refusal, so a
 * guessed id reads as a show with nothing in it.
 */

import { z } from "zod";
import { TvSubtitlesError } from "../errors.js";
import type { SearchRow, TvSubtitlesClient } from "../tvsubtitles/client.js";
import { refusalMessage, strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const searchTitlesDescription =
  "Search tvsubtitles.net for a television series by name. The site catalogues television only, so " +
  "'media_type' takes 'tv' or 'any' and a film is refused rather than answered with an absence. Each " +
  "row carries the id the other tools take, the years the site publishes for the show, and the " +
  "languages it draws a flag for. Pass 'with_subtitle_count' for the number of subtitles the site " +
  "holds per show: it publishes that figure on its catalogue index rather than on the page a search " +
  "answers with, so reading it costs one further request over a large page, and the figure counts " +
  "every season of the show together. Show ids come from here and are never built by hand.";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const searchTitlesInput = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("The name of a series, or part of one. The site matches on the name alone."),
  media_type: z
    .enum(["movie", "tv", "any"])
    .optional()
    .describe(
      "'tv' or 'any' both search the catalogue, which holds television only. 'movie' is refused, " +
        "because answering it with an empty list would report an absence this site cannot establish.",
    ),
  year: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe(
      "Keep only shows whose published years cover this one. When that leaves nothing, the search is " +
        "reported without it and a note says the year was set aside.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Rows to render, ${DEFAULT_LIMIT} by default and ${MAX_LIMIT} at most.`),
  with_subtitle_count: z
    .boolean()
    .optional()
    .describe(
      "Read each row's subtitle count from the site's catalogue index, which costs one further request over a " +
        "page of several hundred kilobytes. The figure counts the whole show rather than this search, and a row " +
        "the index says nothing about keeps a null.",
    ),
} as const;

export const searchTitlesArgs = strictInput(searchTitlesInput);
export type SearchTitlesArgs = z.infer<typeof searchTitlesArgs>;

export const searchTitlesOutputShape = {
  query: z.string(),
  results: z.array(
    z.object({
      id: z.string().describe("Pass this to list_subtitles as 'id'."),
      title: z.string(),
      year: z
        .string()
        .nullable()
        .describe(
          "The years as the site publishes them, a single year or a range. Null where it printed none.",
        ),
      media_type: z.literal("tv").describe("The site catalogues television only."),
      url: z.string().describe("The show's page. Show this when citing the result."),
      subtitle_count: z
        .number()
        .int()
        .nullable()
        .describe(
          "The site's own count of the subtitles it holds for this show, read from its catalogue index when " +
            "'with_subtitle_count' asked for it. Null without that argument, and null where the index printed " +
            "nothing or carries no row for the show.",
        ),
      languages: z
        .array(z.string())
        .describe("The languages the site draws a flag for beside this show."),
      imdb_id: z.null().describe("The site publishes none."),
      tmdb_id: z.null().describe("The site publishes none."),
    }),
  ),
  result_count: z.number().int().describe("Rows rendered here."),
  total_available: z
    .number()
    .int()
    .describe("Rows the site's answer held, before any were rendered."),
  total_counts: z
    .literal("rows_served")
    .describe("What 'total_available' counted: the rows this one search came back with."),
  subtitle_count_scope: z
    .literal("whole_show")
    .nullable()
    .describe(
      "What each row's 'subtitle_count' counts, when one was read: every season of that show together, which is " +
        "a different figure from the rows this search served. Null when no count was asked for.",
    ),
  filters_applied: z.array(z.string()),
  filters_dropped: z.array(z.string()),
  cached: z.boolean().describe("True when the answer was served from memory rather than the site."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

/**
 * How a row's count reads in the text block.
 *
 * A caller who asked for the figure and got none has to see that it is unknown,
 * where a caller who never asked has nothing to be told about.
 */
function countPhrase(count: number | null, asked: boolean): string {
  if (count !== null) {
    return `, ${count} subtitles`;
  }
  return asked ? ", subtitle count unknown" : "";
}

/**
 * The count the site publishes per show, keyed by the id a search hands back.
 *
 * The index is the one page carrying it, and a show it says nothing about is
 * left out of the map rather than entered as zero: the caller has to be able to
 * tell a show with no subtitles from one the index never mentioned.
 */
async function subtitleCounts(client: TvSubtitlesClient): Promise<Map<number, number>> {
  const read = await client.listShows();
  const counts = new Map<number, number>();
  for (const show of read.data.shows) {
    if (show.subtitles !== null) {
      counts.set(show.id, show.subtitles);
    }
  }
  return counts;
}

const MOVIE_REFUSAL =
  "tvsubtitles.net catalogues television series only. Searching it for a film would come back empty, " +
  "which would report an absence this site cannot establish.";

/** Whether the years a show publishes cover the one that was asked for. */
function coversYear(row: SearchRow, year: number): boolean {
  if (row.year === null) {
    return false;
  }
  const bounds = row.year.split("-").map((part) => Number.parseInt(part, 10));
  const first = bounds[0];
  const last = bounds.at(-1);
  if (
    first === undefined ||
    last === undefined ||
    !(Number.isFinite(first) && Number.isFinite(last))
  ) {
    return false;
  }
  return year >= first && year <= last;
}

export async function runSearchTitles(
  client: TvSubtitlesClient,
  args: SearchTitlesArgs,
): Promise<ToolResult> {
  const parsed = searchTitlesArgs.safeParse(args);
  if (!parsed.success) {
    throw new TvSubtitlesError("invalid_input", refusalMessage(parsed.error.issues));
  }
  if (parsed.data.media_type === "movie") {
    throw new TvSubtitlesError("invalid_input", MOVIE_REFUSAL, {
      hint: "Pass 'tv' or leave 'media_type' out.",
    });
  }

  const read = await client.searchShows(parsed.data.query);
  const all = read.data.rows;
  const notes: string[] = [];
  const applied: string[] = [];
  const dropped: string[] = [];

  // A filter that empties the answer is set aside and the answer says so: a
  // narrowing that fails must not be reported as the site holding nothing.
  let kept = all;
  const year = parsed.data.year;
  if (year !== undefined) {
    const narrowed = all.filter((row) => coversYear(row, year));
    if (narrowed.length > 0) {
      kept = narrowed;
      applied.push(`year=${year}`);
    } else {
      dropped.push(`year=${year}`);
      notes.push(
        `No row published years covering ${year}, so the year was set aside and every match is shown.`,
      );
    }
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const rendered = kept.slice(0, limit);
  if (rendered.length < kept.length) {
    notes.push(
      `${rendered.length} of the ${kept.length} rows this search came back with are rendered here. Raise 'limit' for the rest.`,
    );
  }
  if (read.skipped) {
    notes.push(
      `${read.skipped} ${read.skipped === 1 ? "row was" : "rows were"} dropped: the site serves names written into its catalogue through its own add form, and they are not shows.`,
    );
  }

  // Read only when asked for: the figure lives on the catalogue index, which is
  // a page of several hundred kilobytes and a second request on the one queue
  // every tool waits behind.
  const counted = parsed.data.with_subtitle_count === true;
  const counts = counted ? await subtitleCounts(client) : null;
  let uncounted = 0;

  const results = rendered.map((row) => {
    const count = counts?.get(row.id);
    if (counted && count === undefined) {
      uncounted += 1;
    }
    return {
      id: String(row.id),
      title: row.name,
      year: row.year,
      media_type: "tv" as const,
      url: `https://www.tvsubtitles.net/tvshow-${row.id}.html`,
      subtitle_count: count ?? null,
      languages: row.languages,
      imdb_id: null,
      tmdb_id: null,
    };
  });

  if (counted) {
    notes.push(
      "Each count is the figure the site publishes on its catalogue index, counting every season of that show together. It is not the number of rows this search served.",
    );
  }
  if (uncounted > 0) {
    notes.push(
      `The index carries no row for ${uncounted} of the shows found here, so ${uncounted === 1 ? "its count is" : "their counts are"} unknown rather than none.`,
    );
  }

  const body =
    results.length === 0
      ? `tvsubtitles.net matched no series for "${parsed.data.query}".`
      : [
          `Series matching "${parsed.data.query}" on tvsubtitles.net.`,
          ...results.map((row) => {
            const held = countPhrase(row.subtitle_count, counted);
            return `${row.id}: ${row.title}${row.year ? ` (${row.year})` : ""}, ${row.languages.length} languages${held}`;
          }),
        ].join("\n");

  return ok(
    {
      query: parsed.data.query,
      results,
      result_count: results.length,
      total_available: kept.length,
      total_counts: "rows_served" as const,
      subtitle_count_scope: counted ? ("whole_show" as const) : null,
      filters_applied: applied,
      filters_dropped: dropped,
      cached: read.cached,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}
