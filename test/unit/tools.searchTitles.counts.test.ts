/**
 * The site publishes a subtitle count per show, and it publishes it on its
 * index rather than on the page a search answers with. Reading it is therefore
 * a second request over a large page, which is why a caller asks for it.
 *
 * What these tests hold is the honesty of the figure: it is the site's own,
 * counted over the whole show, and a row the index says nothing about keeps a
 * null rather than borrowing a number from anywhere else.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import {
  NOW,
  fails,
  fixture,
  html,
  silentLogger,
  site,
  succeeds,
  textOf,
  wholeSite,
} from "./support.js";

type Args = Parameters<typeof runSearchTitles>[1];

interface Payload {
  results: Array<{ id: string; title: string; subtitle_count: number | null }>;
  subtitle_count_scope: string | null;
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

/** A site whose search answers with rows the index has something to say about. */
const searching = (searchFixture: string) =>
  site([
    [/search1\.php/, (call) => html(fixture(searchFixture), call.url)],
    [/\/tvshows\.html/, (call) => html(fixture("shows-index"), call.url)],
  ]);

async function run(where: ReturnType<typeof searching>, args: Record<string, unknown>) {
  const client = new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: where.impl,
  });
  const result = await succeeds(runSearchTitles(client, args as unknown as Args));
  return { result, payload: result.structuredContent as unknown as Payload, calls: where.calls };
}

describe("the subtitle count a search can be asked for", () => {
  it("is absent, and costs no second request, when nobody asked for it", async () => {
    const where = searching("search-matches");
    const { payload, calls } = await run(where, { query: "Harbour" });

    for (const row of payload.results) {
      expect(row.subtitle_count, `${row.title} carried a count nobody asked for`).toBeNull();
    }
    expect(
      calls.some((call) => call.url.includes("tvshows.html")),
      "the index was read for an answer that does not carry its figure",
    ).toBe(false);
  });

  it("is the site's own figure, read off the index, when it is asked for", async () => {
    const where = searching("search-matches");
    const { payload } = await run(where, { query: "Harbour", with_subtitle_count: true });

    const harbour = payload.results.find((row) => row.title === "Harbour Lights");
    expect(harbour?.subtitle_count, "the index publishes 412 for this show").toBe(412);
  });

  it("says what the figure counts, so it is not read as this search's total", async () => {
    const where = searching("search-matches");
    const { payload } = await run(where, { query: "Harbour", with_subtitle_count: true });

    expect(payload.subtitle_count_scope).toBe("whole_show");
  });

  it("stays null where the index printed nothing, rather than reading as none", async () => {
    const where = searching("search-count-gaps");
    const { payload } = await run(where, { query: "marsh", with_subtitle_count: true });

    const empty = payload.results.find((row) => row.title === "Saltmarsh");
    expect(empty?.subtitle_count, "the index leaves this show's count cell empty").toBeNull();
  });

  it("stays null for a show the index does not carry, and says how many", async () => {
    const where = searching("search-count-gaps");
    const { payload } = await run(where, { query: "marsh", with_subtitle_count: true });

    const absent = payload.results.find((row) => row.title === "Tidewater");
    expect(absent, "the corpus offers no row the index is silent about").toBeDefined();
    expect(absent?.subtitle_count).toBeNull();
    expect(
      payload.notes.some((note) => /index/i.test(note)),
      "nothing told the caller that a row went uncounted",
    ).toBe(true);
  });

  it("reaches the reader of the text block, not only the payload", async () => {
    const where = searching("search-matches");
    const { result } = await run(where, { query: "Harbour", with_subtitle_count: true });

    expect(textOf(result)).toContain("412");
  });

  it("is refused as an argument the tool does not declare when misspelled", async () => {
    const where = wholeSite();
    const client = new TvSubtitlesClient({
      config: loadConfig({}),
      logger: silentLogger(),
      fetchImpl: where.impl,
    });
    const refusal = await fails(
      runSearchTitles(client, { query: "Harbour", with_subtitle_counts: true } as unknown as Args),
    );
    expect(refusal.code).toBe("invalid_input");
  });
});
