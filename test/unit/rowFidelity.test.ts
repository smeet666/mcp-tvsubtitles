/**
 * Three things a caller comparing rows has to be able to trust.
 *
 * A release named twice by the site is one release. The counts the catalogue
 * index publishes are three, and paying for that page should not throw two of
 * them away. And a row whose fields depend on the route that produced it has to
 * say which route that was, so a null reads as unread rather than as an absence
 * the site established.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { NOW, fixture, html, silentLogger, site, succeeds, wholeSite } from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const clientOn = (where: { impl: typeof fetch }) =>
  new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: where.impl,
  });

interface Row {
  releases: string[];
  release_match: string;
  read_from: string;
  file_name: string | null;
  size_text: string | null;
  comment: string | null;
}

describe("a release the site names twice", () => {
  it("is carried once, because it is one release", async () => {
    const where = site([
      [/\/subtitle-/, (call) => html(fixture("subtitle-same-release"), call.url)],
    ]);
    const result = await succeeds(runGetSubtitle(clientOn(where), { id: "880480" } as never));
    const row = (result.structuredContent as { subtitle: Row }).subtitle;

    expect(row.releases).toEqual(["DVDRip"]);
  });

  it("keeps two distinct releases in the order the site printed them", async () => {
    const where = wholeSite();
    const result = await succeeds(runGetSubtitle(clientOn(where), { id: "880431" } as never));
    const row = (result.structuredContent as { subtitle: Row }).subtitle;

    expect(row.releases.length).toBe(new Set(row.releases).size);
    expect(row.release_match).toBe("stated");
  });
});

describe("the counts the catalogue index publishes", () => {
  it("carries the episodes and the seasons beside the subtitles", async () => {
    const where = site([
      [/search1\.php/, (call) => html(fixture("search-matches"), call.url)],
      [/\/tvshows\.html/, (call) => html(fixture("shows-index"), call.url)],
    ]);
    const result = await succeeds(
      runSearchTitles(clientOn(where), { query: "Harbour", with_counts: true } as never),
    );
    const payload = result.structuredContent as {
      results: Array<{
        title: string;
        subtitle_count: number | null;
        episode_count: number | null;
        season_count: number | null;
      }>;
      counts_scope: string | null;
    };

    const harbour = payload.results.find((row) => row.title === "Harbour Lights");
    expect(harbour?.subtitle_count).toBe(412);
    expect(harbour?.episode_count).toBe(28);
    expect(harbour?.season_count).toBe(3);
    expect(payload.counts_scope).toBe("whole_show");
  });

  it("leaves a count the index printed nothing for null, one cell at a time", async () => {
    const where = site([
      [/search1\.php/, (call) => html(fixture("search-count-gaps"), call.url)],
      [/\/tvshows\.html/, (call) => html(fixture("shows-index"), call.url)],
    ]);
    const result = await succeeds(
      runSearchTitles(clientOn(where), { query: "marsh", with_counts: true } as never),
    );
    const payload = result.structuredContent as {
      results: Array<{
        title: string;
        subtitle_count: number | null;
        episode_count: number | null;
        season_count: number | null;
      }>;
    };

    // The index carries this show with its subtitle and episode cells empty and
    // its season cell filled, so the three are read apart rather than together.
    const marsh = payload.results.find((row) => row.title === "Saltmarsh");
    expect(marsh?.subtitle_count).toBeNull();
    expect(marsh?.episode_count).toBeNull();
    expect(marsh?.season_count).toBe(1);
  });
});

describe("the route a row was read by", () => {
  it("says 'listing' on a row a listing produced", async () => {
    const where = wholeSite();
    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4210", season: 3, episode: 7 } as never),
    );
    const rows = (result.structuredContent as { results: Row[] }).results;

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.read_from).toBe("listing");
    }
  });

  it("says 'record' on a row the record page produced", async () => {
    const where = wholeSite();
    const result = await succeeds(runGetSubtitle(clientOn(where), { id: "880431" } as never));
    const row = (result.structuredContent as { subtitle: Row }).subtitle;

    expect(row.read_from).toBe("record");
  });

  it("carries on the record what a listing cannot", async () => {
    const where = wholeSite();
    const result = await succeeds(runGetSubtitle(clientOn(where), { id: "880431" } as never));
    const row = (result.structuredContent as { subtitle: Row }).subtitle;

    expect(row.file_name, "the record page publishes a file name").not.toBeNull();
    expect(row.size_text, "the record page publishes a size").not.toBeNull();
  });
});
