import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_AGENT, MIN_ALLOWED_INTERVAL_MS, loadConfig } from "../../src/config.js";
import type { Config } from "../../src/config.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import {
  NOW,
  type Site,
  fails,
  fixture,
  html,
  settle,
  silentLogger,
  site,
  succeeds,
} from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Every backoff carries a random share. Pinned to its lowest value, each wait
  // becomes a fixed number of milliseconds the fake clock steps over.
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

/** Two different pages, so nothing is answered out of the cache. */
function twoPages(): Site {
  return site([
    [/tvshows/, (call) => html(fixture("shows-index"), call.url)],
    [/tvshow-/, (call) => html(fixture("season-full"), call.url)],
    [/subtitle-/, (call) => html(fixture("subtitle-full"), call.url)],
  ]);
}

describe("the pace this client keeps", () => {
  it("leaves at least the configured interval between two reads", async () => {
    const where = twoPages();
    const client = clientOn(where, { minIntervalMs: 4000 });

    await succeeds(client.listShows());
    await succeeds(client.getSeason(4210, 3));

    expect(where.calls.length).toBe(2);
    expect((where.calls[1]?.at ?? 0) - (where.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(4000);
  });

  it("holds the floor when the interval is handed straight to the published client", async () => {
    const where = twoPages();
    const client = clientOn(where, { minIntervalMs: 1 });

    await succeeds(client.listShows());
    await succeeds(client.getSeason(4210, 3));

    expect(client.intervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    expect((where.calls[1]?.at ?? 0) - (where.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(
      MIN_ALLOWED_INTERVAL_MS,
    );
  });

  it("holds the floor against zero and against a negative interval", async () => {
    for (const asked of [0, -1000, Number.NaN]) {
      const client = clientOn(twoPages(), { minIntervalMs: asked });

      expect(
        client.intervalMs,
        `an interval of ${asked} went under the floor`,
      ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    }
  });

  it("asks one thing at a time, so a second read waits for the first to come back", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const where = site([
      [
        /tvshows/,
        async (call) => {
          await held;
          return html(fixture("shows-index"), call.url);
        },
      ],
      [/tvshow-/, (call) => html(fixture("season-full"), call.url)],
    ]);
    // The deadline is set far past the wait this test drives, so the only
    // reason a second attempt could go out is the first no longer holding it.
    const client = clientOn(where, { timeoutMs: 600_000 });

    const first = client.listShows();
    const second = client.getSeason(4210, 3);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(where.calls.length).toBe(1);

    release?.();
    await succeeds(first);
    await succeeds(second);
    expect(where.calls.length).toBe(2);
  });
});

describe("the User-Agent every attempt carries", () => {
  it("ends with the project identifier and a contact address", async () => {
    const where = twoPages();

    await succeeds(clientOn(where).listShows());

    const sent = where.calls[0]?.headers.get("user-agent") ?? "";
    expect(sent.endsWith(DEFAULT_USER_AGENT)).toBe(true);
  });

  it("keeps them behind whatever a caller of the published client sets", async () => {
    const where = twoPages();

    await succeeds(clientOn(where, { userAgent: "someone-elses-agent/2.0" }).listShows());

    const sent = where.calls[0]?.headers.get("user-agent") ?? "";
    expect(sent).toContain("someone-elses-agent/2.0");
    expect(sent).toContain("mcp-tvsubtitles");
    expect(sent).toMatch(/https?:\/\/\S+/);
  });
});

describe("rate limiting", () => {
  function limitedThenServed(retryAfter: string | null, times: number): Site {
    let seen = 0;
    return site([
      [
        /./,
        (call) => {
          seen += 1;
          if (seen <= times) {
            const headers = new Headers({ "content-type": "text/html" });
            if (retryAfter !== null) {
              headers.set("retry-after", retryAfter);
            }
            const response = new Response("slow down", { status: 429, headers });
            Object.defineProperty(response, "url", { value: call.url });
            return response;
          }
          return html(fixture("shows-index"), call.url);
        },
      ],
    ]);
  }

  it("tries again after a 429 and answers what the site finally served", async () => {
    const where = limitedThenServed("3", 1);

    const read = await succeeds(clientOn(where).listShows());

    expect(where.calls.length).toBe(2);
    expect(read.data.shows.length).toBeGreaterThan(0);
  });

  it("waits the seconds Retry-After names", async () => {
    const where = limitedThenServed("30", 1);

    await succeeds(clientOn(where).listShows());

    expect((where.calls[1]?.at ?? 0) - (where.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(30_000);
  });

  it("waits until the date Retry-After names, in its other form", async () => {
    const when = new Date(NOW.getTime() + 3000).toUTCString();
    const where = limitedThenServed(when, 1);

    await succeeds(clientOn(where).listShows());

    expect(where.calls.length).toBe(2);
    expect((where.calls[1]?.at ?? 0) - (where.calls[0]?.at ?? 0)).toBeGreaterThanOrEqual(3000);
  });

  /**
   * A wait longer than this client is willing to hold a caller for is answered
   * rather than slept through. What the rule forbids is the day-long sleep.
   */
  it("bounds the wait, so a Retry-After of a day does not hold the caller for a day", async () => {
    const where = limitedThenServed("86400", 1);
    const started = Date.now();

    const failure = await fails(clientOn(where).listShows());

    expect(Date.now() - started).toBeLessThan(86_400_000);
    expect(failure.code).toBe("rate_limited");
  });

  it("gives up as rate_limited, which never means the thing is missing", async () => {
    const where = limitedThenServed("1", 99);

    const failure = await fails(clientOn(where, { maxRetries: 2 }).listShows());

    expect(failure.code).toBe("rate_limited");
  });

  it("stops trying once the configured number of attempts is spent", async () => {
    const where = limitedThenServed("1", 99);

    await fails(clientOn(where, { maxRetries: 2 }).listShows());

    expect(where.calls.length).toBe(3);
  });
});

describe("a request that does not complete", () => {
  it("is network_error when the transport refuses", async () => {
    const where = site([
      [
        /./,
        () => {
          throw new TypeError("the transport refused");
        },
      ],
    ]);

    const failure = await fails(clientOn(where, { maxRetries: 0 }).listShows());

    expect(failure.code).toBe("network_error");
  });

  it("is timeout when the deadline passes before an answer", async () => {
    const where = site([[/./, () => new Promise<Response>(() => undefined)]]);

    const failure = await fails(clientOn(where, { maxRetries: 0, timeoutMs: 5000 }).listShows());

    expect(failure.code).toBe("timeout");
  });
});

describe("the cache", () => {
  it("serves a second read of the same page without asking the site", async () => {
    const where = twoPages();
    const client = clientOn(where);

    await succeeds(client.getSubtitle(880_431));
    const again = await succeeds(client.getSubtitle(880_431));

    expect(again.cached).toBe(true);
    expect(where.calls.length).toBe(1);
  });

  it("lets an entry go stale, and asks the site again rather than answering from memory", async () => {
    const where = twoPages();
    const client = clientOn(where, { cacheTtlMs: 60_000 });

    await succeeds(client.getSubtitle(880_431));
    await vi.advanceTimersByTimeAsync(120_000);
    const again = await succeeds(client.getSubtitle(880_431));

    expect(again.cached).toBe(false);
    expect(where.calls.length).toBe(2);
  });

  it("never stores an answer the site refused", async () => {
    let seen = 0;
    const where = site([
      [
        /./,
        (call) => {
          seen += 1;
          if (seen === 1) {
            const response = new Response("slow down", { status: 429 });
            Object.defineProperty(response, "url", { value: call.url });
            return response;
          }
          return html(fixture("shows-index"), call.url);
        },
      ],
    ]);
    const client = clientOn(where, { maxRetries: 0 });

    await fails(client.listShows());
    const read = await succeeds(client.listShows());

    expect(read.cached).toBe(false);
  });
});

describe("the settle helper this suite drives calls with", () => {
  it("refuses a promise that never ends rather than hanging the run", async () => {
    const outcome = await settle(Promise.resolve(1));

    expect(outcome).toEqual({ ok: true, value: 1 });
  });
});
