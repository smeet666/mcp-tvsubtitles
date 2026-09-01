import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import {
  NOW,
  type Site,
  fixture,
  html,
  settle,
  silentLogger,
  site,
  textOf,
  wholeSite,
} from "./support.js";

type Args = Parameters<typeof runSearchTitles>[1];

interface Payload {
  query: string;
  results: Array<{
    id: string;
    title: string;
    year: string | null;
    media_type: string;
    url: string;
    subtitle_count: number | null;
    languages: string[];
    imdb_id: null;
    tmdb_id: null;
  }>;
  result_count: number;
  total_available: number;
  total_counts: string;
  filters_applied: string[];
  filters_dropped: string[];
  cached: boolean;
  source: string;
  notes: string[];
}

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

/** One client, one site, so the calls a search makes can be counted. */
async function searchOn(where: Site, value: Record<string, unknown>) {
  const client = clientOn(where);
  const outcome = await settle(runSearchTitles(client, value as unknown as Args));
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

async function refusalOf(value: Record<string, unknown>, where: Site = wholeSite()) {
  const client = clientOn(where);
  const outcome = await settle(runSearchTitles(client, value as unknown as Args));
  if (outcome.ok) {
    throw new Error(`the call was accepted: ${JSON.stringify(outcome.value.structuredContent)}`);
  }
  const error = outcome.error as { code?: string; message?: string };
  return { code: error.code ?? "", message: error.message ?? "" };
}

describe("search_titles", () => {
  it("answers rows carrying the id the next call takes and the page to cite", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.results.length).toBeGreaterThan(0);
    for (const row of payload.results) {
      expect(row.id.length).toBeGreaterThan(0);
      expect(row.url).toContain("tvsubtitles.net");
      expect(row.media_type).toBe("tv");
    }
  });

  it("states no subtitle count, because the site's search publishes none", async () => {
    const payload = (await searchOn(wholeSite(), { query: "harbour" }))
      .structuredContent as unknown as Payload;

    for (const row of payload.results) {
      expect(row.subtitle_count).toBeNull();
    }
  });

  it("carries no key it did not read, since the site prints neither", async () => {
    const payload = (await searchOn(wholeSite(), { query: "harbour" }))
      .structuredContent as unknown as Payload;

    for (const row of payload.results) {
      expect(row.imdb_id).toBeNull();
      expect(row.tmdb_id).toBeNull();
    }
  });

  it("keeps the years exactly as the site publishes them", async () => {
    const payload = (await searchOn(wholeSite(), { query: "harbour" }))
      .structuredContent as unknown as Payload;
    const years = new Map(payload.results.map((row) => [row.title, row.year]));

    expect(years.get("Harbour Lights")).toBe("2011-2014");
    expect(years.get("Copper Kettle Lane")).toBe("2005-2007");
  });

  it("names what it counted", async () => {
    const payload = (await searchOn(wholeSite(), { query: "harbour" }))
      .structuredContent as unknown as Payload;

    expect(payload.total_counts).toBe("rows_served");
    expect(payload.total_available).toBeGreaterThanOrEqual(payload.result_count);
  });

  it("refuses a film rather than answering an absence this site cannot establish", async () => {
    const failure = await refusalOf({ query: "harbour", media_type: "movie" });

    expect(failure.code).toBe("invalid_input");
  });

  it("searches the catalogue for 'tv' and for 'any' alike", async () => {
    for (const mediaType of ["tv", "any"]) {
      const payload = (await searchOn(wholeSite(), { query: "harbour", media_type: mediaType }))
        .structuredContent as unknown as Payload;

      expect(payload.results.length, `media_type=${mediaType} came back empty`).toBeGreaterThan(0);
    }
  });

  it("answers a search matching nothing with no rows and no failure", async () => {
    const where = site([[/./, (call) => html(fixture("search-empty"), call.url)]]);

    const payload = (await searchOn(where, { query: "nothing at all" }))
      .structuredContent as unknown as Payload;

    expect(payload.results).toEqual([]);
    expect(payload.result_count).toBe(0);
    expect(payload.total_available).toBe(0);
  });
});

describe("the rows the site's add form let into the catalogue", () => {
  it("keeps every attack payload out of the rendered answer", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour" });
    const everything = `${JSON.stringify(result.structuredContent)}\n${textOf(result)}`;

    for (const payload of ["OR 1=1", "ORDER BY", "UNION SELECT", "-- -"]) {
      expect(everything, `the answer carried ${payload}`).not.toContain(payload);
    }
  });

  it("says how many rows it dropped rather than passing them off as absent", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.notes.join(" ")).toMatch(/\b2\b/);
  });
});

describe("the year filter", () => {
  it("is named among the filters it applied", async () => {
    const payload = (await searchOn(wholeSite(), { query: "harbour", year: 2012 }))
      .structuredContent as unknown as Payload;

    expect(payload.filters_applied.join(" ")).toMatch(/\byear\b/);
  });

  it("keeps a show whose published range covers the year asked for", async () => {
    const payload = (await searchOn(wholeSite(), { query: "harbour", year: 2012 }))
      .structuredContent as unknown as Payload;

    expect(payload.results.map((row) => row.title)).toContain("Harbour Lights");
  });

  it("is set aside rather than made to manufacture an absence", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour", year: 1899 + 1 });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.filters_dropped.join(" ")).toMatch(/\byear\b/);
    expect(payload.filters_applied.join(" ")).not.toMatch(/\byear\b/);
  });

  it("says in the notes what it set aside", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour", year: 1900 });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.notes.join(" ")).toMatch(/year/i);
    expect(textOf(result)).toMatch(/year/i);
  });
});

describe("the limit", () => {
  it("says so when it cut the list rather than serving a shorter one in silence", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour", limit: 1 });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.result_count).toBe(1);
    expect(payload.total_available).toBeGreaterThan(1);
    expect(payload.notes.join(" ")).toMatch(/\b1\b/);
  });
});

describe("what a client rendering only the text sees", () => {
  it("gets every note the structured answer carries", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour", limit: 1 });
    const payload = result.structuredContent as unknown as Payload;
    const text = textOf(result);

    for (const note of payload.notes) {
      expect(text, `a note never reached the text block: ${note}`).toContain(note);
    }
  });

  it("gets a link back to the site", async () => {
    const text = textOf(await searchOn(wholeSite(), { query: "harbour" }));

    expect(text).toContain("tvsubtitles.net");
  });

  /**
   * A show whose name opens on the word this server introduces its own notes
   * with must not be able to write one. The structured answer keeps the name
   * as the site published it.
   */
  it("cannot be handed a forged note by a show name", async () => {
    const result = await searchOn(wholeSite(), { query: "harbour" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.results.map((row) => row.title)).toContain("Note: The Quiet Hour");
    for (const line of textOf(result).split("\n")) {
      expect(line.trimEnd(), "a show name forged a line of this server's own").not.toBe(
        "Note: The Quiet Hour",
      );
      expect(
        line.startsWith("Note: The Quiet Hour") || line.startsWith("Source: The Quiet Hour"),
        "a show name opened a line this server writes",
      ).toBe(false);
    }
  });
});
