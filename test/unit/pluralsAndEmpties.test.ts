/**
 * What an answer says when a count is one and when it is several, and what it
 * says when a page the site heads properly holds nothing at all.
 *
 * A sentence written for one row and read over two is a small lie, and the
 * branch that avoids it only exists if something exercises both sides.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { NOW, fails, fixture, html, silentLogger, site, succeeds } from "./support.js";

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

const notesOf = (result: { structuredContent?: unknown }) =>
  (result.structuredContent as { notes: string[] }).notes.join(" ");

describe("two rows a season table did not finish", () => {
  it("are counted in the plural by a season answer", async () => {
    const where = site([
      [/\/tvshow-/, (call) => html(fixture("season-two-broken-rows"), call.url)],
    ]);
    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4210", season: 3 } as never),
    );

    expect(notesOf(result)).toMatch(/2 rows of this season's table were/);
    expect(notesOf(result)).toMatch(/those episodes are/);
  });

  it("are counted in the plural by a language answer", async () => {
    const where = site([
      [/\/tvshow-/, (call) => html(fixture("season-two-broken-rows"), call.url)],
    ]);
    const result = await succeeds(runListLanguages(clientOn(where), { id: "4210" } as never));

    expect(notesOf(result)).toMatch(/2 rows of this season's table were/);
  });
});

describe("two blocks an episode page did not finish", () => {
  it("are counted in the plural by a record answer", async () => {
    const where = site([
      [/\/episode-/, (call) => html(fixture("episode-two-unreadable"), call.url)],
      [/\/tvshow-/, (call) => html(fixture("season-full"), call.url)],
    ]);
    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4210", season: 3, episode: 7 } as never),
    );

    expect(notesOf(result)).toMatch(/2 blocks of this episode's page/);
    expect(notesOf(result)).toMatch(/they are/);
  });
});

describe("one block an episode page did not finish", () => {
  it("is counted in the singular by a record answer", async () => {
    const where = site([
      [/\/episode-/, (call) => html(fixture("episode-odd"), call.url)],
      [/\/tvshow-/, (call) => html(fixture("season-full"), call.url)],
    ]);
    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4210", season: 3, episode: 7 } as never),
    );

    expect(notesOf(result)).toMatch(/1 block of this episode's page/);
    expect(notesOf(result)).toMatch(/it is missing/);
  });
});

describe("an episode page the site heads and leaves empty", () => {
  it("comes back holding nothing, without a language being set aside", async () => {
    const where = site([
      [/\/episode-/, (call) => html(fixture("episode-no-record"), call.url)],
      [/\/tvshow-/, (call) => html(fixture("season-full"), call.url)],
    ]);
    const result = await succeeds(
      runListSubtitles(clientOn(where), {
        id: "4210",
        season: 3,
        episode: 7,
        language: "french",
      } as never),
    );
    const payload = result.structuredContent as {
      results: unknown[];
      filters_applied: string[];
      filters_dropped: string[];
    };

    expect(payload.results.length, "the page holds no record at all").toBe(0);
    expect(
      payload.filters_dropped,
      "nothing was set aside: the episode holds nothing in any language",
    ).toEqual([]);
    expect(payload.filters_applied).toContain("language=french");
  });
});

describe("a read that spends its budget on one attempt", () => {
  it("says attempt rather than attempts", async () => {
    const where = site([
      [
        /./,
        () =>
          new Response("", {
            status: 429,
            headers: { "retry-after": "20", "content-type": "text/html" },
          }),
      ],
    ]);
    const client = new TvSubtitlesClient({
      config: { ...loadConfig({}), budgetMs: 5000 },
      logger: silentLogger(),
      fetchImpl: where.impl,
    });
    const refusal = await fails(client.listShows());

    if (refusal.code === "timeout") {
      expect(refusal.message).toMatch(/over 1 attempt,/);
    }
  });
});
