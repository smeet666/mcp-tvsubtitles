import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { Config } from "../../src/config.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { NOW, type Site, fails, fixture, html, silentLogger, site, succeeds } from "./support.js";

const BASE = "https://www.tvsubtitles.net";

/** The six codes, and no others. A seventh is a vocabulary nobody can branch on. */
const CODES = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
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

function status(code: number, body = "", headers: Record<string, string> = {}): Site {
  return site([
    [
      /./,
      (call) => {
        const response = new Response(body, { status: code, headers });
        Object.defineProperty(response, "url", { value: call.url });
        return response;
      },
    ],
  ]);
}

describe("a status the site answers with", () => {
  it("reads 404 as an absence", async () => {
    const failure = await fails(clientOn(status(404), { maxRetries: 0 }).listShows());

    expect(failure.code).toBe("not_found");
  });

  it("reads 500 as a failure rather than as an absence", async () => {
    const failure = await fails(clientOn(status(500), { maxRetries: 0 }).listShows());

    expect(CODES).toContain(failure.code);
    expect(failure.code).not.toBe("not_found");
  });

  it("reads 403 as a failure rather than as an absence", async () => {
    const failure = await fails(clientOn(status(403), { maxRetries: 0 }).listShows());

    expect(CODES).toContain(failure.code);
    expect(failure.code).not.toBe("not_found");
  });

  it("tries a 503 again before giving up", async () => {
    let seen = 0;
    const where = site([
      [
        /./,
        (call) => {
          seen += 1;
          if (seen === 1) {
            const response = new Response("", { status: 503 });
            Object.defineProperty(response, "url", { value: call.url });
            return response;
          }
          return html(fixture("shows-index"), call.url);
        },
      ],
    ]);

    const read = await succeeds(clientOn(where).listShows());

    expect(where.calls.length).toBe(2);
    expect(read.data.shows.length).toBeGreaterThan(0);
  });

  it("gives every failure one of the six codes and nothing else", async () => {
    for (const code of [400, 401, 404, 410, 500, 502, 503]) {
      const failure = await fails(clientOn(status(code), { maxRetries: 0 }).listShows());

      expect(CODES, `HTTP ${code} earned the code ${failure.code}`).toContain(failure.code);
    }
  });
});

describe("an answer larger than this client will hold", () => {
  it("fails rather than being cut short and read as a shorter catalogue", async () => {
    const where = site([[/./, (call) => html(fixture("shows-index"), call.url)]]);

    const failure = await fails(clientOn(where, { maxBodyBytes: 200, maxRetries: 0 }).listShows());

    expect(CODES).toContain(failure.code);
  });
});

describe("the budget a read is given", () => {
  it("ends the read rather than trying for ever", async () => {
    const where = site([
      [
        /./,
        (call) => {
          const response = new Response("", { status: 503 });
          Object.defineProperty(response, "url", { value: call.url });
          return response;
        },
      ],
    ]);

    const failure = await fails(clientOn(where, { budgetMs: 5000, maxRetries: 8 }).listShows());

    expect(CODES).toContain(failure.code);
  });
});

describe("the entities the site writes its names with", () => {
  it("are read back as the characters they stand for", async () => {
    const where = site([[/./, (call) => html(fixture("shows-index"), call.url)]]);

    const read = await succeeds(clientOn(where).listShows());
    const names = read.data.shows.map((show) => show.name);

    expect(names).toContain("Salt & Pepper '74");
    expect(names.join(" ")).not.toContain("&amp;");
    expect(names.join(" ")).not.toContain("&#39;");
  });
});

describe("a page whose footer the site did not print", () => {
  it("leaves the site's totals unknown rather than counting them as none", async () => {
    const where = site([[/./, (call) => html(fixture("shows-index-no-footer"), call.url)]]);

    const read = await succeeds(clientOn(where).listShows());
    const totals = read.data.totals as unknown as Record<string, number | null> | null;

    if (totals !== null) {
      for (const [name, value] of Object.entries(totals)) {
        expect(value, `${name} came back as a count of none`).not.toBe(0);
      }
    }
    expect(read.data.shows.length).toBeGreaterThan(0);
  });
});

describe("a row the site did not finish writing", () => {
  it("is left out and counted, rather than rendered half read", async () => {
    const where = site([[/./, (call) => html(fixture("season-broken-row"), call.url)]]);

    const read = await succeeds(clientOn(where).getSeason(4210, 3));

    expect(read.data.episodes.length).toBe(1);
    expect(read.skipped).toBe(1);
  });
});

describe("the cache's own bound", () => {
  it("lets an entry go when the store is full, and asks the site for it again", async () => {
    const where = site([
      [/\/tvshows/, (call) => html(fixture("shows-index"), call.url)],
      [/\/tvshow-/, (call) => html(fixture("season-full"), call.url)],
      [/\/subtitle-/, (call) => html(fixture("subtitle-full"), call.url)],
    ]);
    const client = clientOn(where, { cacheMaxEntries: 1 });

    await succeeds(client.listShows());
    await succeeds(client.getSeason(4210, 3));
    const again = await succeeds(client.listShows());

    expect(again.cached).toBe(false);
    expect(where.calls.length).toBe(3);
  });

  it("keeps nothing at all when it is told to keep nothing", async () => {
    const where = site([[/./, (call) => html(fixture("shows-index"), call.url)]]);
    const client = clientOn(where, { cacheTtlMs: 0 });

    await succeeds(client.listShows());
    const again = await succeeds(client.listShows());

    expect(again.cached).toBe(false);
  });
});

describe("the address a read is built for", () => {
  it("escapes what a caller passed rather than letting it reach the path", async () => {
    const where = site([[/./, (call) => html(fixture("season-full"), call.url)]]);

    await fails(clientOn(where).getSeason("4210/../../etc" as unknown as number, 3)).catch(
      () => undefined,
    );

    for (const call of where.calls) {
      expect(call.url.startsWith(BASE), `a read left the site: ${call.url}`).toBe(true);
      expect(call.url).not.toContain("../");
    }
  });
});
