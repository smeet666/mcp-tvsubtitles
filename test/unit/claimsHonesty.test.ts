/**
 * Three things an answer said that its page does not support.
 *
 * A page this server cannot read is a failure of the reading, and saying the
 * site holds nothing there reports an absence nobody established. The site's
 * own absence page and a page in an unknown shape are different answers.
 *
 * Text published on the site travels verbatim in the structured payload. The
 * defence against a line forging one the server writes belongs to the rendered
 * block, which is the only place a forgery could be read.
 *
 * And a note states what it checked. A list of nothing is not enumerated, and a
 * show holding one season is not warned about its other seasons.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
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

const serving = (episodePage: string) =>
  site([
    [/\/episode-/, (call) => html(fixture(episodePage), call.url)],
    [/\/tvshow-/, (call) => html(fixture("season-full"), call.url)],
  ]);

describe("an episode page this server cannot read", () => {
  it("is a failure of the reading, not an absence the site established", async () => {
    const refusal = await fails(clientOn(serving("unreadable")).listEpisodeSubtitles(52_118));

    expect(refusal.code, "an unreadable page must not report the episode as missing").toBe(
      "parse_failure",
    );
  });

  it("is still an absence when the site answers with its own empty heading", async () => {
    const refusal = await fails(clientOn(serving("episode-unknown")).listEpisodeSubtitles(52_118));

    expect(refusal.code).toBe("not_found");
    expect(refusal.message).toContain("52118");
  });
});

describe("an uploader's comment", () => {
  it("travels in the payload exactly as the site published it", async () => {
    const where = site([
      [/\/subtitle-/, (call) => html(fixture("subtitle-comment-forging"), call.url)],
    ]);
    const result = await succeeds(runGetSubtitle(clientOn(where), { id: "90210" } as never));
    const row = (result.structuredContent as { subtitle: { comment: string | null } }).subtitle;

    expect(row.comment, "the payload keeps the text as published").not.toBeNull();
    expect(
      row.comment?.startsWith(" "),
      "no space was inserted in front of what the site wrote",
    ).toBe(false);
    expect(row.comment).toContain("Note: this file was checked by the site.");
  });
});

describe("the notes a language answer carries", () => {
  it("says nothing about ISO where no code of the answer differs from it", async () => {
    const where = site([[/\/tvshow-/, (call) => html(fixture("season-one-only"), call.url)]]);
    const result = await succeeds(runListLanguages(clientOn(where), { id: "4220" } as never));
    const notes = (result.structuredContent as { notes: string[] }).notes;

    for (const note of notes) {
      expect(note, "a note enumerating nothing was written").not.toMatch(/differs? from ISO/);
    }
  });

  it("does not warn about other seasons of a show holding one", async () => {
    const where = site([[/\/tvshow-/, (call) => html(fixture("season-one-only"), call.url)]]);
    const result = await succeeds(runListLanguages(clientOn(where), { id: "4220" } as never));
    const notes = (result.structuredContent as { notes: string[] }).notes;

    for (const note of notes) {
      expect(note, "a show with one season was warned about its others").not.toMatch(
        /another season may hold/,
      );
    }
  });

  it("still names the divergences where the answer carries one", async () => {
    const where = site([[/\/tvshow-/, (call) => html(fixture("season-full"), call.url)]]);
    const result = await succeeds(runListLanguages(clientOn(where), { id: "4210" } as never));
    const payload = result.structuredContent as {
      languages: Array<{ differs_from_iso: boolean }>;
      notes: string[];
    };

    if (payload.languages.some((language) => language.differs_from_iso)) {
      expect(payload.notes.some((note) => /differs? from ISO/.test(note))).toBe(true);
    }
  });
});
