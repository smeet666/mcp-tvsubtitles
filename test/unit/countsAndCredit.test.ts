/**
 * Two claims a caller was reading wrong.
 *
 * A season page carries rows that are not episodes: a spacer, and an aggregate
 * the site offers so a reader can take every episode's subtitles at once.
 * Counting those as episodes the server could not read makes 'skipped' say
 * something the page does not.
 *
 * And a row read from a record's own page names no show, because the page names
 * none. Crediting it to the subtitle's own id gives one field two meanings
 * depending on the route that produced it, and sends a caller who follows the
 * field to an absence the server invented.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
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

const onSeason = (name: string) => site([[/\/tvshow-/, (call) => html(fixture(name), call.url)]]);

describe("the rows of a season page that are not episodes", () => {
  it("leaves the spacer and the aggregate out of the count of what was skipped", async () => {
    const read = await succeeds(clientOn(onSeason("season-with-aggregate")).getSeason(4210, 3));

    expect(read.data.episodes.length, "the season lists three episodes").toBe(3);
    expect(
      read.skipped ?? 0,
      "a spacer and the site's own 'All episodes' row are not episodes it failed to read",
    ).toBe(0);
  });

  it("still counts a row the site opened as an episode and did not finish", async () => {
    const read = await succeeds(clientOn(onSeason("season-broken-row")).getSeason(4210, 3));

    expect(read.skipped ?? 0).toBeGreaterThan(0);
  });

  it("counts a row naming an episode whose number it never wrote", async () => {
    const read = await succeeds(clientOn(onSeason("season-odd")).getSeason(4210, 3));

    expect(read.skipped ?? 0).toBeGreaterThan(0);
  });
});

describe("the show a row is credited to", () => {
  it("is null on a record, because the record page names no show", async () => {
    const result = await succeeds(runGetSubtitle(clientOn(wholeSite()), { id: "880431" } as never));
    const row = (result.structuredContent as { subtitle: { title_id: string | null } }).subtitle;

    expect(row.title_id).toBeNull();
  });

  it("still names the show on a row a listing produced, where the show is known", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(wholeSite()), { id: "4210", season: 3, episode: 7 } as never),
    );
    const rows = (result.structuredContent as { results: Array<{ title_id: string | null }> })
      .results;

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.title_id, "a listing knows the show it was asked about").toBe("4210");
    }
  });
});
