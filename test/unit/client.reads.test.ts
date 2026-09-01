import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { Config } from "../../src/config.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { NOW, type Site, fails, fixture, html, silentLogger, site, succeeds } from "./support.js";

const BASE = "https://www.tvsubtitles.net";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function clientOn(where: Site, overrides: Partial<Config> = {}): TvSubtitlesClient {
  return new TvSubtitlesClient({
    config: { ...loadConfig({}), ...overrides },
    logger: silentLogger(),
    fetchImpl: where.impl,
  });
}

/** A site answering every address with one page, served from one address. */
function onePage(body: string, servedFrom: string): Site {
  return site([[/./, () => html(body, servedFrom)]]);
}

describe("what a read returns", () => {
  it("hands back the data and says whether it came from memory", async () => {
    const where = onePage(fixture("season-full"), `${BASE}/tvshow-4210-3.html`);
    const client = clientOn(where);

    const first = await succeeds(client.getSeason(4210, 3));
    const second = await succeeds(client.getSeason(4210, 3));

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(where.calls.length).toBe(1);
    expect(second.data).toEqual(first.data);
  });

  it("leaves 'skipped' out when nothing was dropped", async () => {
    const where = onePage(fixture("season-full"), `${BASE}/tvshow-4210-3.html`);

    const read = await succeeds(clientOn(where).getSeason(4210, 3));

    expect("skipped" in read && read.skipped !== undefined).toBe(false);
  });

  it("counts in 'skipped' the rows it left out of the catalogue", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());

    expect(read.skipped).toBeGreaterThan(0);
  });
});

describe("the rows the site's own add form let into the catalogue", () => {
  it("drops every attack payload the index serves and counts what it dropped", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());
    const names = read.data.shows.map((show) => show.name);

    for (const payload of [
      '" OR 1=1-- -',
      "' ORDER BY 1000-- -",
      "",
      "admin'-- -",
      "1' UNION SELECT NULL,NULL-- -",
    ]) {
      expect(names, `the catalogue served ${JSON.stringify(payload)}`).not.toContain(payload);
    }
    expect(read.skipped).toBe(5);
  });

  it("keeps an ordinary show whose name holds an apostrophe", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());

    expect(read.data.shows.map((show) => show.name)).toContain("Bishop's Landing");
  });

  it("drops the same payloads out of a search answer", async () => {
    const where = onePage(fixture("search-matches"), `${BASE}/search1.php`);

    const read = await succeeds(clientOn(where).searchShows("harbour"));
    const names = read.data.rows.map((row) => row.name);

    expect(names).not.toContain('" OR 1=1-- -');
    expect(names).not.toContain("");
    expect(read.skipped).toBe(2);
  });
});

describe("a cell the site printed nothing in", () => {
  it("is null rather than zero, so an unknown count is never a count of none", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());
    const kettle = read.data.shows.find((show) => show.name === "Copper Kettle Lane");
    const saltmarsh = read.data.shows.find((show) => show.name === "Saltmarsh");

    expect(kettle?.episodes).toBeNull();
    expect(saltmarsh?.episodes).toBeNull();
    expect(saltmarsh?.subtitles).toBeNull();
  });

  it("keeps a year exactly as published, a single year or a range", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());
    const byName = new Map(read.data.shows.map((show) => [show.name, show.year]));

    expect(byName.get("Harbour Lights")).toBe("2011-2014");
    expect(byName.get("The Ninth Wave")).toBe("2019");
  });
});

describe("the footer totals", () => {
  it("are read as the whole site's counters, under names of their own", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());

    expect(read.data.totals).toMatchObject({ subtitles: 304_847, shows: 2818, episodes: 86_818 });
  });

  it("never stand in for the number of rows one answer served", async () => {
    const where = onePage(fixture("shows-index"), `${BASE}/tvshows.html`);

    const read = await succeeds(clientOn(where).listShows());

    expect(read.data.shows.length).not.toBe(read.data.totals.shows);
  });
});

describe("the season the site served", () => {
  it("is the one the page states rather than the one that was asked for", async () => {
    const where = onePage(fixture("season-full"), `${BASE}/tvshow-4210-3.html`);

    const read = await succeeds(clientOn(where).getSeason(4210, 0));

    expect(read.data.season).toBe(3);
  });

  it("carries the seasons the show holds, which the page links above the table", async () => {
    const where = onePage(fixture("season-full"), `${BASE}/tvshow-4210-3.html`);

    const read = await succeeds(clientOn(where).getSeason(4210, 3));

    expect([...read.data.seasonsAvailable].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("separates a language linking to one record from one linking to a list", async () => {
    const where = onePage(fixture("season-full"), `${BASE}/tvshow-4210-3.html`);

    const read = await succeeds(clientOn(where).getSeason(4210, 3));
    const first = read.data.episodes[0];
    const kinds = (first?.languages ?? []).map((entry) => entry.target.kind);

    expect(kinds).toContain("list");
    expect(kinds).toContain("subtitle");
  });

  it("reads a blank flag as a language holding nothing, never as a language", async () => {
    const where = onePage(fixture("season-full"), `${BASE}/tvshow-4210-3.html`);

    const read = await succeeds(clientOn(where).getSeason(4210, 3));
    const second = read.data.episodes[1];

    expect((second?.languages ?? []).map((entry) => entry.siteCode)).toEqual(["en"]);
  });
});

describe("the four ways this site answers an absence", () => {
  it("reads a show id it does not hold as not_found rather than an empty season", async () => {
    const where = onePage(fixture("season-unknown-show"), `${BASE}/tvshow-999999-1.html`);

    const failure = await fails(clientOn(where).getSeason(999_999, 1));

    expect(failure.code).toBe("not_found");
  });

  it("reads an episode id it does not hold as not_found rather than an empty list", async () => {
    const where = onePage(fixture("episode-unknown"), `${BASE}/episode-999999.html`);

    const failure = await fails(clientOn(where).listEpisodeSubtitles(999_999, undefined));

    expect(failure.code).toBe("not_found");
  });

  it("reads the front page it redirects a bad subtitle id to as not_found", async () => {
    const where = onePage(fixture("front-page"), `${BASE}/`);

    const failure = await fails(clientOn(where).getSubtitle(999_999));

    expect(failure.code).toBe("not_found");
  });

  /**
   * The season page past the last one carries the real show and the real season
   * links, so the show is present and the season is not. Answering it with an
   * empty episode list would state that the season exists and holds nothing.
   */
  it("reads a season past the last one as not_found rather than a season holding nothing", async () => {
    const where = onePage(fixture("season-past-last"), `${BASE}/tvshow-4210-9.html`);

    const outcome = await fails(clientOn(where).getSeason(4210, 9));

    expect(outcome.code).toBe("not_found");
  });

  it("names the seasons the show does hold when it refuses one it does not", async () => {
    const where = onePage(fixture("season-past-last"), `${BASE}/tvshow-4210-9.html`);

    const outcome = await fails(clientOn(where).getSeason(4210, 9));

    expect(outcome.message).toMatch(/\b3\b/);
  });
});

describe("a page in a shape no parser here reads", () => {
  it("is parse_failure rather than an empty answer", async () => {
    const where = onePage(fixture("unreadable"), `${BASE}/tvshows.html`);

    const failure = await fails(clientOn(where).listShows());

    expect(failure.code).toBe("parse_failure");
  });

  it("is never stored, so a second read asks the site again", async () => {
    let attempt = 0;
    const where = site([
      [
        /tvshows/,
        (call) => {
          attempt += 1;
          return html(fixture(attempt === 1 ? "unreadable" : "shows-index"), call.url);
        },
      ],
    ]);
    const client = clientOn(where);

    await fails(client.listShows());
    const read = await succeeds(client.listShows());

    expect(read.cached).toBe(false);
    expect(where.calls.length).toBe(2);
  });
});
