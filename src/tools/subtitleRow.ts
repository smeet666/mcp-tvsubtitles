/**
 * The one shape every answer describes a subtitle with.
 *
 * It is what a caller reading several catalogues compares, so the fields that
 * carry its honesty are the ones a comparison would otherwise get wrong:
 * 'release_match' says whether a version was published or is missing,
 * 'is_pack' says whether a row counts one episode or many, and 'language_code'
 * is filled only where the site's own code maps to a tag with certainty.
 */

import { z } from "zod";
import { languageBySiteCode } from "../tvsubtitles/languages.js";
import type { SubtitleRecord } from "../tvsubtitles/parse.js";
import { indentMarkerLines } from "../tvsubtitles/text.js";

export const subtitleRowSchema = z.object({
  id: z.string().describe("Pass this to get_subtitle."),
  title_id: z
    .string()
    .nullable()
    .describe(
      "The show this belongs to, where the page it was read from names one. A record's own page names " +
        "no show, so a row whose 'read_from' is 'record' carries null here and names the show under " +
        "'show_name' instead.",
    ),
  page_url: z.string().describe("The page a reader opens to download the file."),
  language: z.string().nullable().describe("The language as the site names it."),
  language_code: z
    .string()
    .nullable()
    .describe(
      "BCP 47, where the site's own code maps to one with certainty. Null otherwise: the site writes " +
        "'br' for Brazilian Portuguese, which ISO assigns to Breton, so no code is derived.",
    ),
  releases: z
    .array(z.string())
    .describe(
      "The video releases as published, in the case the uploader typed them. The site states the " +
        "medium and the release group separately, and both appear here when it published them.",
    ),
  read_from: z
    .enum(["listing", "record"])
    .describe(
      "Which page this row was read from. A listing carries no file name, no size and no comment, " +
        "because the site prints those on a record's own page alone: read a null on one of the three as " +
        "unread here rather than as something the site does not publish.",
    ),
  release_match: z
    .enum(["stated", "inferred", "none"])
    .describe(
      "'stated' means the site published the release. 'none' means it published nothing, so the row " +
        "says nothing about which video this is timed to. This site never infers one from a file name.",
    ),
  season: z.number().int().nullable(),
  episode: z.number().int().nullable(),
  is_pack: z
    .boolean()
    .describe("Always false here: the site catalogues one episode per record and holds no packs."),
  files_in_pack: z.number().int().nullable().describe("Always null here, for the same reason."),
  hearing_impaired: z.boolean().nullable().describe("Null: the site publishes no such marker."),
  machine_translated: z.boolean().nullable().describe("Null: the site publishes no such marker."),
  uploader: z
    .string()
    .nullable()
    .describe("Null on roughly two records out of three, where the site printed no author."),
  published_at: z
    .string()
    .nullable()
    .describe(
      "ISO 8601, read from the site's own stamp. The site states no timezone, so this carries none " +
        "and 'published_text' keeps what it printed.",
    ),
  published_text: z.string().nullable().describe("The stamp as the site printed it."),
  downloads: z.number().int().nullable(),
  rating: z
    .object({ good: z.number().int().nullable(), bad: z.number().int().nullable() })
    .describe(
      "Two counters the site publishes and its readers barely use: a zero here is a figure the site " +
        "printed rather than a poor opinion of the file.",
    ),
  file_name: z.string().nullable().describe("The name of the file, as published."),
  size_text: z.string().nullable().describe("The size as published, which the site states in kb."),
  comment: z.string().nullable().describe("Free text the uploader left."),
  source: z.string(),
});

export type SubtitleRow = z.infer<typeof subtitleRowSchema>;

/** The stamp the site prints, `DD.MM.YY HH:MM:SS`. */
const SITE_STAMP = /^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/;

/**
 * Read the site's own stamp into an instant.
 *
 * The stamp is `DD.MM.YY HH:MM:SS` in a timezone the site never states, so no
 * offset is attached: writing one would claim a precision the page does not
 * carry. The two-digit year belongs to this century, which the site's own
 * catalogue bears out, and a year that would land in the future is left unread
 * rather than pushed a hundred years back.
 */
export function toIsoTimestamp(stamp: string | null, now = new Date()): string | null {
  if (stamp === null) {
    return null;
  }
  const parts = SITE_STAMP.exec(stamp.trim());
  if (!parts) {
    return null;
  }
  const [day = 0, month = 0, year = 0, hour = 0, minute = 0, second = 0] = parts
    .slice(1)
    .map((part) => Number.parseInt(part, 10));

  // Every component is held to its own range before any of them is added up.
  // `Date.UTC` carries an overflow into the component above it, so an hour of
  // 24 becomes the next day and a minute of 60 the next hour: the answer would
  // then state an instant the record does not carry.
  const full = 2000 + year;
  if (full > now.getUTCFullYear()) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const at = new Date(Date.UTC(full, month - 1, day, hour, minute, second));
  // A stamp naming a day its month does not hold is not a date, and rolling it
  // forward would report a day the site never printed.
  if (at.getUTCMonth() !== month - 1) {
    return null;
  }
  return at.toISOString().replace(".000Z", "");
}

/** Turn a record the site published into the shape every answer carries. */
export function toSubtitleRow(
  record: SubtitleRecord,
  context: {
    /** The show the row belongs to, or null where the page named none. */
    showId: number | null;
    season?: number;
    episode?: number;
    /** Which page produced this row, which decides what it can carry. */
    readFrom: "listing" | "record";
  },
): SubtitleRow {
  const language = record.siteCode === null ? undefined : languageBySiteCode(record.siteCode);
  // Both cells are the site's own words for the version, kept in the case it
  // printed them: the release group is the token a caller matches a video file
  // by, and folding its case would break the one thing it is good for. The site
  // fills both with the same word often enough that carrying it twice would
  // read as two releases where there is one, so the pair is deduplicated in the
  // order the page printed it.
  const releases = [...new Set([record.rip, record.release].filter((part) => part !== null))];

  return {
    id: String(record.id),
    title_id: context.showId === null ? null : String(context.showId),
    page_url: `https://www.tvsubtitles.net/subtitle-${record.id}.html`,
    language: language?.name ?? null,
    language_code: language?.code ?? null,
    read_from: context.readFrom,
    releases,
    release_match: releases.length > 0 ? "stated" : "none",
    season: record.season ?? context.season ?? null,
    episode: record.episode ?? context.episode ?? null,
    is_pack: false,
    files_in_pack: null,
    hearing_impaired: null,
    machine_translated: null,
    uploader: record.uploader,
    published_at: toIsoTimestamp(record.uploadedText),
    published_text: record.uploadedText,
    downloads: record.downloads,
    rating: { good: record.ratedGood, bad: record.ratedBad },
    file_name: record.fileName,
    size_text: record.sizeText,
    // An uploader's line reaches a model through this server's answers, so a
    // line shaped like one this server writes is shifted off the margin.
    comment: record.comment === null ? null : indentMarkerLines(record.comment),
    source: "tvsubtitles.net",
  };
}
