/**
 * Live smoke tests against tvsubtitles.net.
 *
 * These are the tests the fixtures cannot replace: they are what notices the
 * day the site's shape moves. They are skipped unless TVS_LIVE=1, since a suite
 * that reaches the network on every run fails for reasons that have nothing to
 * do with the change under test.
 *
 *   TVS_LIVE=1 npm run test:live
 *
 * One request per route, paced by the client's own rate limiter, and every
 * assertion names the field it guards so a break reads as "the site stopped
 * sending X" rather than "something is wrong".
 */

import process from "node:process";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { TvSubtitlesClient, requireLanguage } from "../../src/tvsubtitles/client.js";

const LIVE = process.env.TVS_LIVE === "1";
const TIMEOUT = 120_000;

/** A finished series, chosen because a closed catalogue does not move under the test. */
const SHOW = "Smallville";

const client = new TvSubtitlesClient({ config: loadConfig({ TVS_LOG_LEVEL: "silent" }) });

describe.runIf(LIVE)("live: tvsubtitles.net", () => {
  let showId = 0;
  let episodeId = 0;
  let subtitleId = 0;
  let season = 0;

  it(
    "search returns rows carrying the id the other routes take",
    async () => {
      const { data } = await client.searchShows(SHOW);

      expect(data.rows.length, "the search matched nothing at all").toBeGreaterThan(0);
      const first = data.rows[0];
      expect(typeof first?.id, "row.id").toBe("number");
      expect(first?.name, "row.name").toContain(SHOW);
      expect(data.totals.shows, "the footer stopped publishing its show total").toBeGreaterThan(0);

      showId = first?.id ?? 0;
    },
    TIMEOUT,
  );

  it(
    "the show index still parses into rows",
    async () => {
      const { data } = await client.listShows();

      expect(data.shows.length, "the index parsed into no rows").toBeGreaterThan(1000);
      expect(data.shows[0]?.name, "index row name").toBeTruthy();
    },
    TIMEOUT,
  );

  it(
    "season 0 answers the newest season, and says which",
    async () => {
      const { data } = await client.getSeason(showId, 0);

      expect(data.showName, "the season page stopped naming its show").toContain(SHOW);
      expect(data.season, "the season the page served").toBeGreaterThan(0);
      expect(data.seasonsAvailable, "the page stopped naming the season it is showing").toContain(
        data.season,
      );
      expect(data.episodes.length, "the season listed no episodes").toBeGreaterThan(0);

      season = data.season;
      episodeId = data.episodes[0]?.episodeId ?? 0;
    },
    TIMEOUT,
  );

  it(
    "a season past the last one is an absence rather than an empty season",
    async () => {
      await expect(client.getSeason(showId, 199)).rejects.toMatchObject({ code: "not_found" });
    },
    TIMEOUT,
  );

  it(
    "an episode lists records carrying a language and an id",
    async () => {
      const { data } = await client.listEpisodeSubtitles(episodeId, requireLanguage("english"));

      expect(data.length, "the episode listed no records in english").toBeGreaterThan(0);
      const first = data[0];
      expect(typeof first?.id, "record.id").toBe("number");
      expect(first?.siteCode, "record.siteCode").toBe("en");
      expect(first?.uploadedText, "record.uploadedText").toBeTruthy();

      subtitleId = first?.id ?? 0;
    },
    TIMEOUT,
  );

  it(
    "one record carries the ten labelled fields the site publishes",
    async () => {
      const { data } = await client.getSubtitle(subtitleId);

      expect(data.showName, "record.showName").toBeTruthy();
      expect(data.season, "record.season").toBe(season);
      expect(data.fileName, "record.fileName").toBeTruthy();
      expect(data.sizeText, "record.sizeText").toMatch(/kb/i);
      expect(data.uploadedText, "record.uploadedText").toMatch(/^\d{2}\.\d{2}\.\d{2} /);
      expect(typeof data.downloads, "record.downloads").toBe("number");
    },
    TIMEOUT,
  );

  it(
    "a subtitle id the site does not hold is an absence",
    async () => {
      await expect(client.getSubtitle(999_999_999)).rejects.toMatchObject({ code: "not_found" });
    },
    TIMEOUT,
  );
});
