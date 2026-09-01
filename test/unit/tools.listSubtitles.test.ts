import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
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

type Args = Parameters<typeof runListSubtitles>[1];

interface Payload {
  id: string;
  show_name: string;
  season: number;
  season_requested: number | null;
  seasons_available: number[];
  kind: "coverage" | "subtitles";
  episode: number | null;
  results: Record<string, unknown>[];
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

async function list(value: Record<string, unknown>, where: Site = wholeSite()) {
  const outcome = await settle(runListSubtitles(clientOn(where), value as unknown as Args));
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

async function refusalOf(value: Record<string, unknown>, where: Site = wholeSite()) {
  const outcome = await settle(runListSubtitles(clientOn(where), value as unknown as Args));
  if (outcome.ok) {
    throw new Error(`the call was accepted: ${JSON.stringify(outcome.value.structuredContent)}`);
  }
  const error = outcome.error as { code?: string; message?: string };
  return { code: error.code ?? "", message: error.message ?? "" };
}

describe("a season on its own", () => {
  it("answers that season's coverage, one row per episode", async () => {
    const payload = (await list({ id: "4210", season: 3 })).structuredContent as unknown as Payload;

    expect(payload.kind).toBe("coverage");
    expect(payload.episode).toBeNull();
    expect(payload.results.length).toBe(3);
  });

  it("names the show the site printed rather than the id it was asked about", async () => {
    const payload = (await list({ id: "4210", season: 3 })).structuredContent as unknown as Payload;

    expect(payload.show_name).toBe("Harbour Lights");
  });

  it("says which languages hold something and leaves the blank flags out", async () => {
    const payload = (await list({ id: "4210", season: 3 })).structuredContent as unknown as Payload;
    const rows = payload.results as Array<{ episode: number; languages: string[] }>;

    expect(rows.find((row) => row.episode === 8)?.languages).toEqual(["english"]);
    expect(rows.find((row) => row.episode === 9)?.languages).toEqual([]);
  });

  it("names what it counted", async () => {
    const payload = (await list({ id: "4210", season: 3 })).structuredContent as unknown as Payload;

    expect(payload.total_counts).toBe("episodes_in_season");
  });

  it("leaves a count the site printed nothing for null rather than zero", async () => {
    const payload = (await list({ id: "4210", season: 3 })).structuredContent as unknown as Payload;
    const rows = payload.results as Array<{ episode: number; subtitle_count: number | null }>;

    expect(rows.find((row) => row.episode === 9)?.subtitle_count).toBeNull();
    expect(rows.find((row) => row.episode === 7)?.subtitle_count).toBe(5);
  });

  it("carries the seasons the show holds, which the page links above the table", async () => {
    const payload = (await list({ id: "4210", season: 3 })).structuredContent as unknown as Payload;

    expect([...payload.seasons_available].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});

describe("a season left out", () => {
  it("reads the newest one and says which that was, beside the one asked for", async () => {
    const payload = (await list({ id: "4210" })).structuredContent as unknown as Payload;

    expect(payload.season_requested).toBeNull();
    expect(payload.season).toBe(3);
  });
});

describe("an episode named", () => {
  it("answers the records themselves", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 7 }))
      .structuredContent as unknown as Payload;

    expect(payload.kind).toBe("subtitles");
    expect(payload.episode).toBe(7);
    expect(payload.results.length).toBeGreaterThan(0);
  });

  it("names what it counted", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 7 }))
      .structuredContent as unknown as Payload;

    expect(payload.total_counts).toBe("rows_served");
  });

  it("carries on every record the page a reader downloads it from", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 7 }))
      .structuredContent as unknown as Payload;

    for (const row of payload.results as Array<{ page_url: string; id: string }>) {
      expect(row.page_url).toMatch(/^https:\/\/www\.tvsubtitles\.net\/subtitle-\d+\.html$/);
      expect(row.id.length).toBeGreaterThan(0);
    }
  });

  it("carries no subtitle text and no download address", async () => {
    const result = await list({ id: "4210", season: 3, episode: 7 });
    const everything = JSON.stringify(result.structuredContent);

    expect(everything).not.toContain("download-");
    for (const row of (result.structuredContent as unknown as Payload).results) {
      expect(Object.keys(row)).not.toContain("text");
      expect(Object.keys(row)).not.toContain("download_url");
    }
  });

  it("says 'none' on the record the site published no release for", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 7 }))
      .structuredContent as unknown as Payload;
    const rows = payload.results as Array<{
      release_match: string;
      releases: string[];
      language: string;
    }>;
    const bare = rows.find((row) => row.language === "portuguese(br)");

    expect(bare?.release_match).toBe("none");
    expect(bare?.releases).toEqual([]);
  });

  it("counts one episode per record, since this site holds no season pack", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 7 }))
      .structuredContent as unknown as Payload;

    for (const row of payload.results as Array<{
      is_pack: boolean;
      files_in_pack: number | null;
    }>) {
      expect(row.is_pack).toBe(false);
      expect(row.files_in_pack).toBeNull();
    }
  });
});

describe("the language filter", () => {
  it("is named among the filters it applied, and narrows the answer", async () => {
    const result = await list({ id: "4210", season: 3, episode: 7, language: "french" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.filters_applied.join(" ")).toMatch(/language/i);
    for (const row of payload.results as Array<{ language: string }>) {
      expect(row.language).toBe("french");
    }
  });

  it("takes the site's own code and the BCP 47 tag alike", async () => {
    for (const asked of ["fr", "french"]) {
      const payload = (await list({ id: "4210", season: 3, episode: 7, language: asked }))
        .structuredContent as unknown as Payload;

      expect(payload.results.length, `language=${asked} came back empty`).toBeGreaterThan(0);
    }
  });

  it("refuses a language the site does not hold rather than answering an absence", async () => {
    const failure = await refusalOf({ id: "4210", season: 3, episode: 7, language: "klingon" });

    expect(failure.code).toBe("invalid_input");
    expect(failure.message).toContain("klingon");
  });

  it("is set aside when it empties the answer, and the answer says what it put aside", async () => {
    const result = await list({ id: "4210", season: 3, episode: 7, language: "korean" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.filters_dropped.join(" ")).toMatch(/language/i);
    // A caller reading only the answer has to be told which language it lost.
    expect(payload.filters_dropped.join(" ")).toMatch(/korean/i);
  });
});

describe("the limit", () => {
  it("says so when it cut the list", async () => {
    const result = await list({ id: "4210", season: 3, limit: 1 });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.result_count).toBe(1);
    expect(payload.total_available).toBeGreaterThan(1);
    expect(payload.notes.join(" ")).toMatch(/\b1\b/);
  });
});

describe("what this site answers instead of a refusal", () => {
  it("reads a show id it does not hold as not_found rather than a season holding nothing", async () => {
    const where = site([[/./, (call) => html(fixture("season-unknown-show"), call.url)]]);

    const failure = await refusalOf({ id: "999999", season: 1 }, where);

    expect(failure.code).toBe("not_found");
  });

  it("reads a season past the last one as not_found rather than a season holding nothing", async () => {
    const failure = await refusalOf({ id: "4210", season: 9 });

    expect(failure.code).toBe("not_found");
  });

  it("reads an episode the season does not hold as not_found", async () => {
    const failure = await refusalOf({ id: "4210", season: 3, episode: 44 });

    expect(failure.code).toBe("not_found");
  });
});

describe("what a client rendering only the text sees", () => {
  it("gets every note the structured answer carries", async () => {
    const result = await list({ id: "4210", season: 3, limit: 1 });
    const payload = result.structuredContent as unknown as Payload;
    const text = textOf(result);

    for (const note of payload.notes) {
      expect(text, `a note never reached the text block: ${note}`).toContain(note);
    }
  });

  it("gets a link back to the site", async () => {
    expect(textOf(await list({ id: "4210", season: 3 }))).toContain("tvsubtitles.net");
  });

  it("cannot be handed a forged note by an episode title", async () => {
    const result = await list({ id: "4210", season: 3 });
    const payload = result.structuredContent as unknown as Payload;
    const titles = (payload.results as Array<{ title: string }>).map((row) => row.title);

    expect(titles).toContain("Note: Harbour Master");
    for (const line of textOf(result).split("\n")) {
      expect(line.startsWith("Note: Harbour Master")).toBe(false);
    }
  });
});

describe("the two places a season's flag can point", () => {
  /**
   * A language holding one subtitle is linked straight to that record, and a
   * language holding several to the episode in that language. Reading only one
   * of the two shapes loses half the catalogue.
   */
  it("reads an episode whose only language links straight to one record", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 8 }))
      .structuredContent as unknown as Payload;

    expect(payload.kind).toBe("subtitles");
    expect(payload.results.length).toBeGreaterThan(0);
  });

  it("reads an episode whose language links to a list of records", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 7 }))
      .structuredContent as unknown as Payload;

    expect(payload.results.length).toBeGreaterThan(1);
  });

  it("answers an episode holding nothing at all without inventing a record", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 9 }))
      .structuredContent as unknown as Payload;

    expect(payload.results).toEqual([]);
    expect(payload.total_available).toBe(0);
  });
});

describe("a second read of the same season", () => {
  it("says it came from memory", async () => {
    const where = wholeSite();
    const client = clientOn(where);
    const args = { id: "4210", season: 3 } as unknown as Args;

    const first = await settle(runListSubtitles(client, args));
    const second = await settle(runListSubtitles(client, args));

    expect(first.ok && (first.value.structuredContent as unknown as Payload).cached).toBe(false);
    expect(second.ok && (second.value.structuredContent as unknown as Payload).cached).toBe(true);
  });
});

describe("a season narrowed by language", () => {
  it("names the filter and keeps only the episodes that language holds", async () => {
    const result = await list({ id: "4210", season: 3, language: "french" });
    const payload = result.structuredContent as unknown as Payload;
    const rows = payload.results as Array<{ episode: number; languages: string[] }>;

    expect(payload.kind).toBe("coverage");
    expect(payload.filters_applied.join(" ")).toMatch(/language/i);
    expect(rows.map((row) => row.episode)).toEqual([7]);
    for (const row of rows) {
      expect(row.languages).toContain("french");
    }
  });

  it("counts the episodes of the season rather than the rows it served", async () => {
    const payload = (await list({ id: "4210", season: 3, language: "french" }))
      .structuredContent as unknown as Payload;

    expect(payload.total_counts).toBe("episodes_in_season");
  });

  it("is set aside when it empties the season, and the answer names what it lost", async () => {
    const result = await list({ id: "4210", season: 3, language: "korean" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.filters_dropped.join(" ")).toMatch(/korean/i);
    expect(payload.filters_applied.join(" ")).not.toMatch(/language/i);
  });

  it("takes the site's own two-letter code as readily as the name", async () => {
    const payload = (await list({ id: "4210", season: 3, language: "br" }))
      .structuredContent as unknown as Payload;
    const rows = payload.results as Array<{ episode: number }>;

    expect(rows.map((row) => row.episode)).toEqual([7]);
  });

  it("cuts the coverage to the limit and says it did", async () => {
    const result = await list({ id: "4210", season: 3, language: "english", limit: 1 });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.result_count).toBe(1);
    expect(payload.notes.join(" ")).toMatch(/\b1\b/);
  });
});

describe("an episode named without a season", () => {
  it("is read in the newest season the site holds, and the answer says which", async () => {
    const payload = (await list({ id: "4210", episode: 7 }))
      .structuredContent as unknown as Payload;

    expect(payload.season).toBe(3);
    expect(payload.season_requested).toBeNull();
    expect(payload.episode).toBe(7);
    expect(payload.kind).toBe("subtitles");
  });
});

describe("an episode narrowed by language", () => {
  it("reads the record straight through where that language holds exactly one", async () => {
    const payload = (await list({ id: "4210", season: 3, episode: 8, language: "english" }))
      .structuredContent as unknown as Payload;

    expect(payload.results.length).toBe(1);
    expect(payload.filters_applied.join(" ")).toMatch(/language/i);
  });

  it("is set aside on an episode that language holds nothing of", async () => {
    const result = await list({ id: "4210", season: 3, episode: 8, language: "french" });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.results.length).toBeGreaterThan(0);
    expect(payload.filters_dropped.join(" ")).toMatch(/french/i);
  });
});
