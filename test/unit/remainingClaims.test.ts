/**
 * What is left of two stress campaigns, gathered in one place.
 *
 * Each of these is a sentence an answer wrote that its own payload, its own
 * page, or its own reading does not support.
 */

import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Config, loadConfig } from "../../src/config.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
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

const clientOn = (where: { impl: typeof fetch }, config?: Partial<Config>) =>
  new TvSubtitlesClient({
    config: { ...loadConfig({}), ...config },
    logger: silentLogger(),
    fetchImpl: where.impl,
  });

describe("1. a note about a language set aside", () => {
  it("does not claim an absence while showing rows in that very language", async () => {
    // The site's page for one language comes back empty while the episode's own
    // page holds rows in it. The two disagree, and the answer must follow what
    // it renders rather than what the narrowed read returned.
    const where = site([
      [/\/episode-\d+-fr\.html/, (call) => html(fixture("episode-language-empty"), call.url)],
      [/\/episode-/, (call) => html(fixture("episode-many-languages"), call.url)],
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
      results: Array<{ language: string | null }>;
      filters_dropped: string[];
      notes: string[];
    };

    const shown = payload.results.filter((row) => row.language === "french");
    const claimsAbsence = payload.notes.some((note) =>
      /holds no subtitle in that language/.test(note),
    );
    expect(
      shown.length > 0 && claimsAbsence,
      "the answer said the episode holds nothing in a language it is displaying",
    ).toBe(false);
  });
});

describe("2. the rows an index answer left out", () => {
  it("names each population it actually dropped, rather than calling them all payloads", async () => {
    const where = site([
      [/search1\.php/, (call) => html(fixture("search-matches"), call.url)],
      [/\/tvshows\.html/, (call) => html(fixture("shows-index"), call.url)],
    ]);
    const result = await succeeds(runSearchTitles(clientOn(where), { query: "water" } as never));
    const notes = (result.structuredContent as { notes: string[] }).notes;
    const said = notes.join(" ");

    // The corpus holds one attack payload and one row with no name at all.
    // Both are left out, and the answer has to say so under its own reason.
    expect(said, "nothing said a row carried a name from the add form").toMatch(/add form/);
    expect(said, "nothing said a row carried no name").toMatch(/no name/);
  });
});

describe("3. a list of nothing", () => {
  it("is not enumerated when a season page names no seasons", async () => {
    const where = site([[/\/tvshow-/, (call) => html(fixture("season-no-list"), call.url)]]);
    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4210", season: 1 } as never),
    );
    const notes = (result.structuredContent as { notes: string[] }).notes;

    for (const note of notes) {
      expect(note, "an empty enumeration was written").not.toMatch(/holds seasons\s*\./);
      expect(note).not.toMatch(/holds seasons\s*,/);
    }
  });

  it("is not enumerated by a language answer either", async () => {
    const where = site([[/\/tvshow-/, (call) => html(fixture("season-no-list"), call.url)]]);
    const result = await succeeds(runListLanguages(clientOn(where), { id: "4210" } as never));
    const notes = (result.structuredContent as { notes: string[] }).notes;

    for (const note of notes) {
      expect(note, "an empty enumeration was written").not.toMatch(/holds seasons\s*\./);
      expect(note, "an empty enumeration was written").not.toMatch(/holds seasons\s*,/);
    }
  });
});

describe("4. characters that reverse a line's direction", () => {
  it("do not reach the rendered block, whoever sent them", async () => {
    const where = site([[/search1\.php/, (call) => html(fixture("search-empty"), call.url)]]);
    const result = await succeeds(runSearchTitles(clientOn(where), { query: "‮Shogun" } as never));
    const text = (result.content ?? []).map((block) => block.text ?? "").join("\n");

    for (const control of ["‪", "‫", "‬", "‭", "‮", "⁦", "⁧", "⁨", "⁩", "‎", "‏"]) {
      expect(text.includes(control), "a bidi control survived into the block").toBe(false);
    }
  });

  it("survive in the payload, which is where what was received is kept", async () => {
    const where = site([[/search1\.php/, (call) => html(fixture("search-empty"), call.url)]]);
    const result = await succeeds(runSearchTitles(clientOn(where), { query: "‮Shogun" } as never));

    expect((result.structuredContent as { query: string }).query).toContain("‮");
  });
});

describe("5. the settings a client is handed", () => {
  it("are not read from the environment a second time", async () => {
    const written: string[] = [];
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        written.push(String(chunk));
        return true;
      });
    // The environment itself refuses a setting, so any read of it warns.
    // Building a client from a config already resolved must not read it again.
    process.env.TVS_MAX_RETRIES = "99";
    const resolved = loadConfig(process.env);
    const before = written.length;
    const client = new TvSubtitlesClient({ config: resolved, logger: silentLogger() });
    spy.mockRestore();
    process.env.TVS_MAX_RETRIES = undefined;

    expect(written.length - before, "the environment was read a second time").toBe(0);
    expect(client.intervalMs, "the settings handed over are the ones in force").toBe(
      resolved.minIntervalMs,
    );
  });
});

describe("6. an address the site holds nothing at", () => {
  it("names what was asked for rather than pointing at nothing", async () => {
    const where = site([[/./, (call) => html("", call.url, 404)]]);
    const refusal = await fails(clientOn(where).listShows());

    expect(refusal.code).toBe("not_found");
    expect(refusal.message, "the refusal names no address").toMatch(/tvshows\.html/);
  });
});
