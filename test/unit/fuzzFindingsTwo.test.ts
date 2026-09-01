/**
 * The rest of what a stress campaign found: nine claims a caller could read
 * wrong, from a control character that survives to a message that names the
 * wrong culprit.
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { ok } from "../../src/tools/shared.js";
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

describe("7. every character Unicode calls a direction control", () => {
  it("is taken out of the rendered block, the arabic letter mark included", () => {
    const body = "Harbour؜ Lights and ⁩a mark⁨";
    const text = ok({}, body)
      .content.map((block) => block.text)
      .join("\n");

    for (const control of ["؜", "⁨", "⁩"]) {
      expect(text.includes(control), `${control.codePointAt(0)?.toString(16)} survived`).toBe(
        false,
      );
    }
  });
});

describe("8. a season page in a shape this cannot read", () => {
  it("is a failure of the reading, not a season the site published empty", async () => {
    // The site heads every season page with its episode table, the page for a
    // season past the last one and the page for a show it does not hold both
    // included. A page carrying only a title is not one of its answers.
    const truncated =
      '<html><head><title>TVsubtitles.net - Subtitles "Harbour Lights" season 3</title></head><body></body></html>';
    const where = site([[/\/tvshow-/, (call) => html(truncated, call.url)]]);
    const refusal = await fails(clientOn(where).getSeason(4210, 3));

    expect(refusal.code).toBe("parse_failure");
  });

  it("is still an empty season when the site serves its table with no rows", async () => {
    const where = site([[/\/tvshow-/, (call) => html(fixture("season-past-last"), call.url)]]);
    const refusal = await fails(clientOn(where).getSeason(4210, 9));

    expect(refusal.code, "the site's own answer about a season it does not hold").toBe("not_found");
  });
});

describe("9. an answer that needed two pages", () => {
  it("is reported as cached only when both came from memory", async () => {
    const where = site([
      [/search1\.php/, (call) => html(fixture("search-matches"), call.url)],
      [/\/tvshows\.html/, (call) => html(fixture("shows-index"), call.url)],
    ]);
    const client = clientOn(where);
    await succeeds(runSearchTitles(client, { query: "Harbour" } as never));
    // The search is in memory now; the index has never been read.
    const result = await succeeds(
      runSearchTitles(client, { query: "Harbour", with_counts: true } as never),
    );

    expect(
      (result.structuredContent as { cached: boolean }).cached,
      "the index was fetched, so this answer cost the site a request",
    ).toBe(false);
  });
});

describe("10. a setting outside the range this server keeps", () => {
  it("is complained about for what was actually wrong with it", () => {
    const written: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        written.push(String(chunk));
        return true;
      });
    // Through the constructor, where a caller hands over settings whole: the
    // environment path refuses an out-of-range value before the floor sees it.
    new TvSubtitlesClient({
      config: { ...loadConfig({}), minIntervalMs: 999_999_999 },
      logger: silentLogger(),
    }).intervalMs;
    spy.mockRestore();
    const said = written.join(" ");

    expect(said, "a value above the ceiling was called too low").not.toMatch(/below the/);
    expect(said).toMatch(/above|ceiling|widest/i);
  });
});

describe("11. what a search says it came back with", () => {
  it("counts the rows the site answered, before a filter narrowed them", async () => {
    const where = site([[/search1\.php/, (call) => html(fixture("search-matches"), call.url)]]);
    const wide = await succeeds(runSearchTitles(clientOn(where), { query: "h" } as never));
    const narrow = await succeeds(
      runSearchTitles(clientOn(where), { query: "h", year: 2012 } as never),
    );

    const all = (wide.structuredContent as { total_available: number }).total_available;
    const filtered = narrow.structuredContent as { total_available: number; result_count: number };
    expect(filtered.total_available, "the site's answer did not shrink because we filtered").toBe(
      all,
    );
    expect(filtered.result_count).toBeLessThanOrEqual(all);
  });
});

describe("12. a refusal written by a tool", () => {
  it("names the argument it is about, as a schema refusal does", async () => {
    const where = site([[/./, (call) => html(fixture("front-page"), call.url)]]);
    const client = clientOn(where);

    const badId = await fails(runListSubtitles(client, { id: "0" } as never));
    expect(badId.message).toMatch(/'id'/);

    const badLanguage = await fails(
      runListSubtitles(client, { id: "4210", language: "zz" } as never),
    );
    expect(badLanguage.message).toMatch(/'language'/);

    const film = await fails(
      runSearchTitles(client, { query: "Dune", media_type: "movie" } as never),
    );
    expect(film.message).toMatch(/'media_type'/);
  });
});

describe("13. a season named without a show", () => {
  it("is said to have been ignored rather than dropped in silence", async () => {
    const where = site([[/./, (call) => html(fixture("front-page"), call.url)]]);
    const result = await succeeds(runListLanguages(clientOn(where), { season: 3 } as never));
    const notes = (result.structuredContent as { notes: string[] }).notes.join(" ");

    expect(notes, "the season was dropped without a word").toMatch(/season/i);
  });
});

describe("14. a read that ran out of its budget", () => {
  it("does not say the site gave no answer when the site answered", async () => {
    const where = site([[/./, (call) => html("", call.url, 503)]]);
    const client = new TvSubtitlesClient({
      config: { ...loadConfig({}), budgetMs: 5000, maxRetries: 4 },
      logger: silentLogger(),
      fetchImpl: where.impl,
    });
    const refusal = await fails(client.listShows());

    if (refusal.code === "timeout") {
      expect(refusal.message, "the site answered, with 503s").not.toMatch(/No answer from/);
    }
  });
});

describe("15. a text block cut to fit", () => {
  it("ends on one ellipsis rather than two", () => {
    const text = ok({}, "x".repeat(4000))
      .content.map((block) => block.text)
      .join("\n");

    expect(text, "two ellipses were appended").not.toMatch(/……/);
  });
});
