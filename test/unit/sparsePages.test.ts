/**
 * Pages the site serves with cells it usually fills left empty.
 *
 * Every column of the index, every labelled cell of a listing row and the years
 * a search writes inside a link is a thing the site prints on most rows and
 * omits on some. What each answer may say about the missing one is the whole
 * subject here: an empty cell is a figure nobody published, a season the site
 * lists but prints no episode for is what it answered rather than a failure to
 * read it, and a row naming no release says nothing about the video it fits.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { isPayload, parseEpisodeListing } from "../../src/tvsubtitles/parse.js";
import { toIsoTimestamp } from "../../src/tools/subtitleRow.js";
import {
  NOW,
  type Site,
  fails,
  fixture,
  html,
  silentLogger,
  site,
  succeeds,
  textOf,
  wholeSite,
} from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function clientOn(where: Site): TvSubtitlesClient {
  return new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: where.impl,
  });
}

function payloadOf(result: unknown): Record<string, unknown> {
  return (result as { structuredContent: Record<string, unknown> }).structuredContent;
}

describe("a name the site printed", () => {
  it("is not an attack when the cell was left empty", () => {
    // An empty name is a cell the site published nothing in, which is counted
    // as unnamed rather than as a payload written through the add form.
    expect(isPayload("")).toBe(false);
    expect(isPayload("   ")).toBe(false);
  });

  it("is not an attack when it merely opens on an apostrophe", () => {
    // A show whose name starts with a quote is an ordinary show. Only one
    // carrying a comment marker or a comparison after it is a probe.
    expect(isPayload("'Til The Tide Turns")).toBe(false);
    expect(isPayload("'Til Death")).toBe(false);
  });
});

describe("the index read whole", () => {
  it("reports nothing skipped when every row of it read", async () => {
    const where = site([[/tvshows/, (call) => html(fixture("shows-index-clean"), call.url)]]);

    const read = await succeeds(clientOn(where).listShows());

    expect(read.skipped).toBeUndefined();
    expect(read.data.dropped).toEqual({ payloads: 0, unnamed: 0, unreadable: 0 });
  });

  it("reads a row whose year cell is empty as a year the site did not publish", async () => {
    const where = site([[/tvshows/, (call) => html(fixture("shows-index-clean"), call.url)]]);

    const read = await succeeds(clientOn(where).listShows());
    const row = read.data.shows.find((show) => show.id === 4219);

    expect(row?.year).toBeNull();
  });
});

describe("a search whose rows are not all shows", () => {
  const searching = (): Site =>
    wholeSite([
      [/search1\.php/, (call) => html(fixture("search-sparse"), call.url)],
      [/tvshows/, (call) => html(fixture("shows-index"), call.url)],
    ]);

  it("names the single reason a row was left out without counting rows", async () => {
    const result = await succeeds(
      runSearchTitles(clientOn(searching()), { query: "tidewater", limit: 10 }),
    );
    const notes = payloadOf(result).notes as string[];

    expect(notes.some((note) => note.includes("through the site's own add form"))).toBe(true);
    expect(notes.some((note) => note.includes("rows were left out"))).toBe(false);
  });

  it("carries a null year for a row the site published no years on", async () => {
    const result = await succeeds(
      runSearchTitles(clientOn(searching()), { query: "tidewater", limit: 10 }),
    );
    const rows = payloadOf(result).results as { id: string; year: string | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.year).toBeNull();
    expect(textOf(result)).not.toContain("()");
  });

  it("sets a year filter aside rather than reporting a row with no year as outside it", async () => {
    // Narrowing cannot manufacture an absence: a row the site published no year
    // for says nothing about the year asked for, so the filter is dropped and
    // the answer names what it set aside.
    const result = await succeeds(
      runSearchTitles(clientOn(searching()), { query: "tidewater", year: 2019, limit: 10 }),
    );
    const payload = payloadOf(result);

    expect(payload.filters_dropped).toContain("year=2019");
    expect((payload.results as unknown[]).length).toBe(1);
  });

  it("says a single show's counts are unknown in the singular", async () => {
    const result = await succeeds(
      runSearchTitles(clientOn(searching()), { query: "tidewater", with_counts: true, limit: 10 }),
    );
    const notes = payloadOf(result).notes as string[];

    expect(notes.some((note) => note.includes("its count is unknown rather than none"))).toBe(true);
  });
});

describe("a season the site lists and prints no episode for", () => {
  const where = (): Site =>
    wholeSite([[/\/tvshow-4210-3\.html/, (call) => html(fixture("season-no-episodes"), call.url)]]);

  it("says the site published the page and listed nothing on it", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(where()), { id: "4210", season: 3, limit: 10 }),
    );
    const payload = payloadOf(result);

    expect(payload.result_count).toBe(0);
    expect(
      (payload.notes as string[]).some((note) =>
        note.includes("listed no episodes on it, which is what it answered"),
      ),
    ).toBe(true);
    expect((payload.notes as string[]).some((note) => note.includes("seasons 1, 2, 3"))).toBe(true);
    expect(textOf(result)).toContain("lists no episodes for Harbour Lights season 3");
  });

  it("names no episode at all in the refusal when an episode of it is asked for", async () => {
    const failure = await fails(
      runListSubtitles(clientOn(where()), { id: "4210", season: 3, episode: 7, limit: 10 }),
    );

    expect(failure.code).toBe("not_found");
    expect(failure.message).toContain("lists no episode 7");
  });

  it("names the one season a show holds in the singular", async () => {
    const one = wholeSite([
      [/\/tvshow-4220-2\.html/, (call) => html(fixture("season-one-past-last"), call.url)],
    ]);

    const failure = await fails(runListSubtitles(clientOn(one), { id: "4220", season: 2 }));

    expect(failure.code).toBe("not_found");
    expect(failure.message).toContain("It holds season 1.");
  });
});

describe("a season page carrying no paragraph of season links", () => {
  it("establishes nothing about which seasons the show holds", async () => {
    const where = wholeSite([
      [/\/tvshow-4210-3\.html/, (call) => html(fixture("season-no-description"), call.url)],
    ]);

    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4210", season: 3, limit: 10 }),
    );

    expect(payloadOf(result).seasons_available).toEqual([]);
  });
});

describe("an episode listing written with cells left out", () => {
  const where = (): Site =>
    wholeSite([
      [/\/tvshow-4210-4\.html/, (call) => html(fixture("season-sparse"), call.url)],
      [/\/episode-52130/, (call) => html(fixture("episode-sparse"), call.url)],
    ]);

  it("carries a null where the site printed no cell, and no release where it named none", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(where()), { id: "4210", season: 4, episode: 1, limit: 10 }),
    );
    const rows = payloadOf(result).results as Record<string, unknown>[];

    const bare = rows.find((row) => row.id === "880450");
    expect(bare?.language).toBeNull();
    expect(bare?.releases).toEqual([]);
    expect(bare?.release_match).toBe("none");
    expect(bare?.uploader).toBeNull();
    expect(bare?.downloads).toBeNull();
  });

  it("reads a release the row states only inside the brackets of its heading", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(where()), { id: "4210", season: 4, episode: 1, limit: 10 }),
    );
    const rows = payloadOf(result).results as Record<string, unknown>[];

    expect(rows.find((row) => row.id === "880451")?.releases).toEqual(["HDTV.FQM"]);
  });

  it("renders a row with no downloads without printing a figure nobody published", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(where()), { id: "4210", season: 4, episode: 1, limit: 10 }),
    );

    expect(textOf(result)).toContain("880450:");
    expect(textOf(result)).toContain("? downloads");
  });

  it("heads the answer without a title where the season row named none", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(where()), { id: "4210", season: 4, episode: 1, limit: 10 }),
    );

    expect(textOf(result)).toContain("Harbour Lights 4x01.");
  });

  it("reads an episode page served without the body element the site wraps it in", () => {
    const parsed = parseEpisodeListing(fixture("episode-headless"));

    expect(parsed?.rows).toHaveLength(1);
    expect(parsed?.rows[0]?.release).toBe("LOL");
  });
});

describe("a record whose title names a language the site draws no flag for", () => {
  it("carries no site code rather than one guessed from the name", async () => {
    const where = wholeSite([
      [/\/subtitle-880473/, (call) => html(fixture("subtitle-unknown-language"), call.url)],
    ]);

    const result = await succeeds(runGetSubtitle(clientOn(where), { id: "880473" }));
    const subtitle = payloadOf(result).subtitle as Record<string, unknown>;

    expect(subtitle.language).toBeNull();
    expect(subtitle.language_code).toBeNull();
  });
});

describe("the stamp a record carries", () => {
  it("is left unread when its two-digit year would land in the future", () => {
    // The two-digit year belongs to this century. A stamp reading later than
    // today is not a date this can place, and pushing it a hundred years back
    // would state an instant the record does not carry.
    expect(toIsoTimestamp("04.02.30 09:12:30", NOW)).toBeNull();
    expect(toIsoTimestamp("04.02.14 09:12:30", NOW)).toBe("2014-02-04T09:12:30");
  });
});
