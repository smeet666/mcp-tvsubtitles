/**
 * Reading the site's pages into the shapes the tools answer with.
 *
 * Two habits of the site govern everything here. It answers an id it does not
 * hold with a page rather than with a refusal, so absence is read from what a
 * page contains and never from its status. And it serves rows that were written
 * into it through its own add form, so a row has to earn its place in an answer.
 */

import { parseFailure } from "../errors.js";
import { LANGUAGES, languageBySiteCode } from "./languages.js";
import { captured, plainText, readInteger } from "./text.js";

/**
 * Names that are attack payloads rather than shows.
 *
 * The site's add form has been used to write SQL injection probes into the
 * catalogue, and the site serves them as show names. Eighty of the 2818 rows in
 * the index carry one. Passing them on would put attack strings into a model's
 * context under the name of a television series, so they are dropped and
 * counted.
 */
const PAYLOAD = new RegExp(
  [
    "EXTRACTVALUE|CONCAT\\(|\\bSELECT\\b|\\bUNION\\b|\\bORDER\\s+BY\\s+\\d",
    "SLEEP\\(|BENCHMARK\\(|WAITFOR\\s+DELAY|pg_sleep|DBMS_PIPE",
    "0x7e|<script|\\bELT\\(|\\bRLIKE\\b|\\|\\||/\\*",
    "\\bAND\\s+\\d+\\s*=\\s*\\d|\\bOR\\s+\\d+\\s*=\\s*\\d|\\bCASE\\s+WHEN\\b",
  ].join("|"),
  "i",
);

const PROBE_OPENING = /^['"()]/;
const PROBE_BODY = /(--|#|=|\))/;
/**
 * A SQL comment marker, which is how a probe ends what it broke into.
 *
 * Two readings, because a probe need not open on a quote to carry one:
 * a quote followed anywhere by a comment marker, and a name trailing off into
 * one. Neither shape belongs to a title anybody would print.
 */
const QUOTED_COMMENT = /['"`][^'"`]*--/;
const TRAILING_COMMENT = /--\s*-?\s*$/;

/** Whether a name the site printed is one a reader would recognise as a show. */
export function isPayload(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === "") {
    return false;
  }
  if (PAYLOAD.test(trimmed)) {
    return true;
  }
  if (QUOTED_COMMENT.test(trimmed) || TRAILING_COMMENT.test(trimmed)) {
    return true;
  }
  // A name opening on a quote or a bracket and carrying a comment marker or a
  // comparison is a probe that got past the list above by being short.
  return PROBE_OPENING.test(trimmed) && PROBE_BODY.test(trimmed.slice(1));
}

/** One row of the show index. */
export interface ShowRow {
  id: number;
  name: string;
  /** How many seasons the site counts, or null where it printed nothing. */
  seasons: number | null;
  episodes: number | null;
  subtitles: number | null;
  /** The year as published, a single year or a range of two. */
  year: string | null;
}

/**
 * The rows an answer left out, counted by why.
 *
 * Three things get dropped and they are not the same thing. Reporting them
 * under one reason states of every dropped row what is true of one population,
 * which is a count saying more than it measured.
 */
export interface Dropped {
  /** Names written into the catalogue through the site's own add form. */
  payloads: number;
  /** Rows the site served with no name at all. */
  unnamed: number;
  /** Rows too incomplete for this to read. */
  unreadable: number;
}

export const droppedTotal = (dropped: Dropped): number =>
  dropped.payloads + dropped.unnamed + dropped.unreadable;

export interface ShowIndex {
  shows: ShowRow[];
  dropped: Dropped;
}

/**
 * A row of one of the site's data tables.
 *
 * Counting these against the rows that could be read is what turns a row the
 * site wrote incompletely into a number, rather than into an episode or a show
 * that quietly disappears from an answer.
 */
const DATA_ROW = /<tr align="middle" bgcolor="#ffffff">/g;

/** A whole data row, so what it holds can be read before it is counted. */
const WHOLE_DATA_ROW = /<tr align="middle" bgcolor="#ffffff">[\s\S]*?<\/tr>/g;

/**
 * Whether a row of a season table was written as an episode.
 *
 * A season table holds two rows that are not episodes: a spacer, and an
 * aggregate the site offers so a reader can take a whole season at once.
 * Neither carries an episode code, and the aggregate addresses pages of a
 * different shape, carrying two numbers where an episode's own page carries
 * one. Counting either as an episode the reading failed on would make the
 * count say something the page does not.
 */
const EPISODE_CODE_CELL = /<td>\d+x\d+<\/td>/;
const EPISODE_OWN_PAGE = /href="episode-\d+\.html"/;
const looksLikeEpisode = (row: string): boolean =>
  EPISODE_CODE_CELL.test(row) || EPISODE_OWN_PAGE.test(row);

const INDEX_ROW =
  /<td>\d+<\/td>\s*<td[^>]*><a href="tvshow-(\d+)-\d+\.html"><b>(.*?)<\/b><\/a><\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/gs;

/** Read the whole catalogue from the index page. */
export function parseShowIndex(html: string): ShowIndex {
  const shows: ShowRow[] = [];
  const dropped: Dropped = { payloads: 0, unnamed: 0, unreadable: 0 };
  let readable = 0;

  for (const match of html.matchAll(INDEX_ROW)) {
    readable += 1;
    const name = plainText(captured(match, 2));
    if (name === "") {
      dropped.unnamed += 1;
      continue;
    }
    if (isPayload(name)) {
      dropped.payloads += 1;
      continue;
    }
    const year = plainText(captured(match, 6));
    shows.push({
      id: Number.parseInt(captured(match, 1), 10),
      name,
      seasons: readInteger(plainText(captured(match, 3))),
      episodes: readInteger(plainText(captured(match, 4))),
      subtitles: readInteger(plainText(captured(match, 5))),
      year: year === "" ? null : year,
    });
  }

  if (shows.length === 0) {
    throw parseFailure("The show index came back without a single readable row.");
  }
  const present = [...html.matchAll(DATA_ROW)].length;
  dropped.unreadable = Math.max(0, present - readable);
  return { shows, dropped };
}

/** One row of a search answer. */
export interface SearchRow {
  id: number;
  name: string;
  year: string | null;
  /** The languages the site draws a flag for beside this show. */
  languages: string[];
}

const SEARCH_ROW = /<a href="\/tvshow-(\d+)\.html">(.*?)<\/a>(.*?)(?=<li|<\/ul)/gs;
/** The years the site writes inside a search row's link, after the name. */
const SEARCH_YEARS = /^(.*?)\s*\((\d{4}(?:-\d{4})?)\)\s*$/;
/** One item of the list a search is answered with, readable or not. */
const SEARCH_ITEM = /<li[\s>]/g;
const FLAG = /images\/flags\/([a-z]{2})\.gif/g;

/**
 * Read a search answer.
 *
 * An empty list here is a real absence: the site ran the search and matched
 * nothing, which is a different answer from a page it could not read.
 */
export function parseSearchResults(html: string): { rows: SearchRow[]; dropped: Dropped } {
  if (!html.includes("Search results")) {
    throw parseFailure("The search answer did not come back as a list of results.");
  }

  const rows: SearchRow[] = [];
  const dropped: Dropped = { payloads: 0, unnamed: 0, unreadable: 0 };

  for (const match of html.matchAll(SEARCH_ROW)) {
    const label = plainText(captured(match, 2));
    // The site writes the years inside the link, after the name.
    const withYear = SEARCH_YEARS.exec(label);
    const name = withYear ? captured(withYear, 1) : label;
    if (name.trim() === "") {
      dropped.unnamed += 1;
      continue;
    }
    if (isPayload(name)) {
      dropped.payloads += 1;
      continue;
    }
    const languages = [...captured(match, 3).matchAll(FLAG)]
      .map((flag) => languageBySiteCode(captured(flag, 1))?.name)
      .filter((named): named is string => named !== undefined);

    rows.push({
      id: Number.parseInt(captured(match, 1), 10),
      name,
      year: withYear ? captured(withYear, 2) : null,
      languages: [...new Set(languages)],
    });
  }

  // Every match is served as one item of the list, so the items count what the
  // page holds and the reading above counts what could be read. A row the site
  // did not finish writing disappears otherwise, under a note written to name it.
  const present = [...html.matchAll(SEARCH_ITEM)].length;
  dropped.unreadable = Math.max(0, present - (rows.length + dropped.payloads + dropped.unnamed));
  return { rows, dropped };
}

/** Where a language's flag on a season page points. */
export type FlagTarget =
  /** The language holds one subtitle, and the flag links straight to it. */
  | { kind: "subtitle"; subtitleId: number }
  /** The language holds several, and the flag links to the list of them. */
  | { kind: "list"; episodeId: number; siteCode: string };

/** One episode of a season, as the season page lists it. */
export interface EpisodeRow {
  episodeId: number;
  season: number;
  episode: number;
  title: string;
  /** How many subtitles the site counts for this episode. */
  amount: number | null;
  /** One entry per language holding something, keyed by the site's own name. */
  languages: { language: string; siteCode: string; target: FlagTarget }[];
}

export interface SeasonPage {
  showId: number;
  showName: string;
  /**
   * The season this page holds.
   *
   * The site answers season 0 by redirecting to its newest season, and answers
   * a season past the last one with an empty table rather than a refusal, so
   * the season served is read from the page rather than assumed.
   */
  season: number;
  /** Every season the site holds for this show. */
  seasonsAvailable: number[];
  episodes: EpisodeRow[];
  /**
   * Rows of the episode table that came back too incomplete to read.
   *
   * A row carrying an episode code and nothing else is one the site did not
   * finish writing. Dropping it silently would hand back a season that reads as
   * whole while an episode is missing from it.
   */
  skipped: number;
}

const SEASON_TITLE = /<title>[^<]*Subtitles\s+"(.*?)"\s+season\s+(\d+)/i;
/** The heading of the table a season page lists its episodes in. */
const SEASON_TABLE = /<th[^>]*><b>Episode<\/b><\/th>/i;
/**
 * The paragraph the site heads a season page with, listing every season it
 * holds for the show.
 */
const SEASON_LIST = /<p class="description">([\s\S]*?)<\/p>/;
/**
 * One season named in that paragraph.
 *
 * The season being displayed is printed in bold without a link, and the others
 * are printed as links. Reading the links alone therefore always loses the
 * season in hand, which is the one a caller most often asked for.
 */
const SEASON_NAMED = /<b>Season (\d+)<\/b>/g;
const EPISODE_ROW =
  /<td>(\d+)x(\d+)<\/td>\s*<td[^>]*><a href="episode-(\d+)\.html"><b>(.*?)<\/b><\/a><\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/gs;
const FLAG_LINK =
  /<a href="(subtitle-(\d+)|episode-(\d+)-([a-z]{2}))\.html"><img src="images\/flags\/([a-z]{2})\.gif/g;

/**
 * Read one season page.
 *
 * A show id the site does not hold is answered with this same page carrying an
 * empty name, so an empty name is the absence rather than a parse failure.
 */
export function parseSeasonPage(html: string, askedShowId: number): SeasonPage | null {
  const titled = SEASON_TITLE.exec(html);
  if (!titled) {
    throw parseFailure("A season page came back without the heading that names its show.");
  }

  // The site heads every season page with this table, the page it answers a
  // season past the last one with and the page it answers a show it does not
  // hold with both included. A page without it is not one of its answers, and
  // reporting it as a season published empty would state an absence nobody
  // established.
  if (!SEASON_TABLE.test(html)) {
    throw parseFailure("A season page came back without the table it lists episodes in.");
  }

  const showName = plainText(captured(titled, 1));
  if (showName === "") {
    return null;
  }

  // Read from the paragraph the site heads the page with, which names every
  // season it holds whether or not it links to it. A season the site does not
  // hold is answered with this same paragraph and its own number left out of
  // it, which is how a season past the last one is told from one that exists.
  const listed = SEASON_LIST.exec(html);
  const seasonsAvailable = [
    ...new Set(
      [...(listed ? captured(listed, 1) : "").matchAll(SEASON_NAMED)]
        .map((named) => Number.parseInt(captured(named, 1), 10))
        .filter((season) => season > 0),
    ),
  ].sort((a, b) => a - b);

  const episodes: EpisodeRow[] = [];
  for (const row of html.matchAll(EPISODE_ROW)) {
    episodes.push({
      episodeId: Number.parseInt(captured(row, 3), 10),
      season: Number.parseInt(captured(row, 1), 10),
      episode: Number.parseInt(captured(row, 2), 10),
      title: plainText(captured(row, 4)),
      amount: readInteger(plainText(captured(row, 5))),
      languages: readFlags(captured(row, 6)),
    });
  }

  const rowsPresent = [...html.matchAll(WHOLE_DATA_ROW)].filter((row) =>
    looksLikeEpisode(row[0]),
  ).length;

  return {
    showId: askedShowId,
    showName,
    season: Number.parseInt(captured(titled, 2), 10),
    seasonsAvailable,
    episodes,
    skipped: Math.max(0, rowsPresent - episodes.length),
  };
}

/**
 * Read the language flags of one episode row.
 *
 * A flag points to one of two places, and which one says how many subtitles the
 * language holds: straight to a record when it holds one, to a list when it
 * holds several. A reader that expects either shape alone loses half the
 * catalogue, so both are read here and the difference is kept.
 */
function readFlags(cell: string): EpisodeRow["languages"] {
  const languages: EpisodeRow["languages"] = [];
  for (const flag of cell.matchAll(FLAG_LINK)) {
    const language = languageBySiteCode(captured(flag, 5));
    if (!language) {
      continue;
    }
    const single = flag[2];
    languages.push({
      language: language.name,
      siteCode: language.siteCode,
      target: single
        ? { kind: "subtitle", subtitleId: Number.parseInt(single, 10) }
        : {
            kind: "list",
            episodeId: Number.parseInt(captured(flag, 3), 10),
            siteCode: captured(flag, 4),
          },
    });
  }
  return languages;
}

/** One subtitle, as a listing row or as its own record. */
export interface SubtitleRecord {
  id: number;
  /** The show and episode the record names, where the page states them. */
  showName: string | null;
  season: number | null;
  episode: number | null;
  episodeTitle: string | null;
  /** The medium the video came from, `HDTV` and `WEB` being the common ones. */
  rip: string | null;
  /** The release group, kept in the case the uploader typed it in. */
  release: string | null;
  /** Free text the uploader left. */
  comment: string | null;
  uploader: string | null;
  fileName: string | null;
  /** The size as published, which the site always states in kilobytes. */
  sizeText: string | null;
  /** `DD.MM.YY HH:MM:SS`, in a timezone the site never states. */
  uploadedText: string | null;
  downloads: number | null;
  /** Two counters the site publishes and its readers barely use. */
  ratedGood: number | null;
  ratedBad: number | null;
  /** The site's own two-letter code for the language of this file. */
  siteCode: string | null;
}

const LISTING_ROW = /<a href="\/subtitle-(\d+)\.html">(.*?)<\/a>/gs;
const RED = /<span style="color:red">(\d+)<\/span>/;
const GREEN = /<span style="color:green">(\d+)<\/span>/;
const LISTING_TITLE = /<h5[^>]*>(?:<img[^>]*>)?(.*?)<\/h5>/s;
/**
 * The flag drawn inside a listing row.
 *
 * The page also prints a heading naming the language, and that heading is
 * written in whichever language the site happens to hold it in, so a row taken
 * from the page listing every language is identified by its flag instead.
 */
const ROW_FLAG = /<h5[^>]*>\s*<img src="images\/flags\/([a-z]{2})\.gif/;
/** The release a listing row names, written in brackets at the end of its title. */
const TRAILING_BRACKET = /\(([^()]*)\)\s*$/;
const LISTING_FIELD = (name: string) =>
  new RegExp(`alt="${name}"[^>]*>(?:\\s*<img[^>]*>)?(.*?)</p>`, "s");
/** The heading the site puts on every episode page, whether or not it holds one. */
const EPISODE_PAGE = /Subtitles for this episode/i;
const EPISODE_HEADING =
  /(\d+)x(\d+)\s*(?:&nbsp;|\s)*(.*?)\s*\(Season\s+(\d+)\s+Episode\s+(\d+)\)/is;

/**
 * Read the subtitles one episode holds.
 *
 * The site serves an episode either whole or narrowed to one language, and both
 * come back in this shape. Each row names its own language through the flag it
 * draws, so the answer stays correct on the page that lists every language.
 */
export function parseEpisodeListing(
  html: string,
): { rows: SubtitleRecord[]; skipped: number } | null {
  // Read from the body alone. The head titles the page with the same episode
  // number, and a heading matched there runs on through the navigation before it
  // reaches the brackets that close it, taking the whole chrome in as a title.
  const pageBody = bodyOf(html);
  // The site heads every episode page this way, the one it answers an id it does
  // not hold with included. Its absence is what tells a page in a shape this
  // cannot read from a page saying there is no such episode, and reporting the
  // first as the second would state an absence nobody established.
  if (!EPISODE_PAGE.test(pageBody)) {
    throw parseFailure("An episode page came back in a shape this server cannot read.");
  }
  const heading = EPISODE_HEADING.exec(plainText(pageBody.slice(0, 8000)));
  // An episode id the site does not hold is answered with this page carrying
  // blanks where the numbers go, which is the absence rather than a failure.
  if (!heading) {
    return null;
  }

  const rows: SubtitleRecord[] = [];
  for (const row of html.matchAll(LISTING_ROW)) {
    const body = captured(row, 2);
    const titled = LISTING_TITLE.exec(body);
    const label = titled ? plainText(captured(titled, 1)) : "";
    // The release the row was cut for sits in brackets at the end of its title.
    const bracketed = TRAILING_BRACKET.exec(label);

    rows.push({
      id: Number.parseInt(captured(row, 1), 10),
      showName: null,
      season: Number.parseInt(captured(heading, 4), 10),
      episode: Number.parseInt(captured(heading, 5), 10),
      episodeTitle: plainText(captured(heading, 3)) || null,
      rip: field(body, "rip"),
      release: field(body, "release") ?? (bracketed ? plainText(captured(bracketed, 1)) : null),
      comment: null,
      uploader: field(body, "author"),
      fileName: null,
      sizeText: null,
      uploadedText: field(body, "uploaded"),
      downloads: readInteger(field(body, "downloaded") ?? ""),
      ratedGood: readInteger(GREEN.exec(body)?.[1] ?? ""),
      ratedBad: readInteger(RED.exec(body)?.[1] ?? ""),
      siteCode: ROW_FLAG.exec(body)?.[1] ?? null,
    });
  }

  // Every record is served as a link to its own page, so the links count the
  // blocks the page holds and the reading above counts those that named a
  // record. A block whose link carries no id is one the site wrote short.
  const present = [...html.matchAll(RECORD_LINK)].length;
  return { rows, skipped: Math.max(0, present - rows.length) };
}

/** A link to a record's page, whether or not it names one. */
const RECORD_LINK = /href="\/subtitle[^"]*"/g;

/** The page below its head, where the site writes what it is answering. */
const BODY_OPENS = /<body\b/i;
const bodyOf = (html: string): string => {
  const opened = html.search(BODY_OPENS);
  return opened === -1 ? html : html.slice(opened);
};

/** One labelled cell of a listing row, or null where the site printed nothing. */
function field(body: string, name: string): string | null {
  const found = LISTING_FIELD(name).exec(body);
  if (!found) {
    return null;
  }
  const value = plainText(captured(found, 1));
  return value === "" ? null : value;
}

const RECORD_LABELS = [
  "episode title",
  "episode number",
  "rip",
  "release",
  "comment",
  "author",
  "filename",
  "size",
  "uploaded",
  "number of downloads",
] as const;

const RECORD_TITLE = /<title>[^<]*Download\s+(\S+)\s+subtitles\s+for\s+(.*?)\s+(\d+)x(\d+)/i;
const RECORD_NUMBERING = /Season\s+(\d+)\s+episode\s+(\d+)/i;
const RATED_GOOD = /id="love"[^>]*>(\d*)</;
const RATED_BAD = /id="hate"[^>]*>(\d*)</;
const SCRIPT_OR_STYLE = /<(script|style)[\s\S]*?<\/\1>/g;
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * Read one subtitle's record.
 *
 * Six of the ten labelled fields are absent on some records, `author` on two
 * out of three, so every one of them is null rather than blank when the site
 * printed nothing.
 */
export function parseSubtitleRecord(html: string, id: number): SubtitleRecord {
  const text = plainText(html.replace(SCRIPT_OR_STYLE, ""));
  const boundary = RECORD_LABELS.map((label) => `${label}:`)
    .concat("Report bad")
    .map((token) => token.replace(REGEX_SPECIAL, "\\$&"))
    .join("|");

  const read = (label: string): string | null => {
    const found = new RegExp(`${label}:\\s*(.*?)\\s*(?=${boundary})`, "i").exec(text);
    const value = found ? captured(found, 1).trim() : "";
    return value === "" ? null : value;
  };

  const titled = RECORD_TITLE.exec(html);
  const numbered = RECORD_NUMBERING.exec(read("episode number") ?? "");
  if (!(titled || numbered)) {
    throw parseFailure("A subtitle record came back without the episode it belongs to.", {
      url: `subtitle-${id}`,
    });
  }

  return {
    id,
    showName: titled ? plainText(captured(titled, 2)) : null,
    season: numbered ? Number.parseInt(captured(numbered, 1), 10) : null,
    episode: numbered ? Number.parseInt(captured(numbered, 2), 10) : null,
    episodeTitle: read("episode title"),
    rip: read("rip"),
    release: read("release"),
    comment: read("comment"),
    uploader: read("author"),
    fileName: read("filename"),
    sizeText: read("size"),
    uploadedText: read("uploaded"),
    downloads: readInteger(read("number of downloads")),
    ratedGood: readInteger(RATED_GOOD.exec(html)?.[1] ?? ""),
    ratedBad: readInteger(RATED_BAD.exec(html)?.[1] ?? ""),
    // The record heads itself with the language's full name rather than a flag.
    siteCode: titled ? namedCode(captured(titled, 1)) : null,
  };
}

/** The site code of a language the record names by its full name. */
const namedCode = (name: string): string | null =>
  LANGUAGES.find((language) => language.name === name.toLowerCase())?.siteCode ?? null;

/** The site-wide totals printed in the footer of every page. */
export interface SiteTotals {
  subtitles: number | null;
  shows: number | null;
  episodes: number | null;
}

/**
 * Read the totals the footer prints.
 *
 * These count the whole site and answer no search, so they travel under their
 * own names and are never reported as the size of a result set.
 */
export function parseSiteTotals(html: string): SiteTotals {
  const text = plainText(html);
  const read = (label: string) =>
    readInteger(new RegExp(`${label}:\\s*([\\d  ,]+)`).exec(text)?.[1] ?? "");
  return {
    subtitles: read("Total subtitles"),
    shows: read("TV Shows"),
    episodes: read("TV Episodes"),
  };
}
