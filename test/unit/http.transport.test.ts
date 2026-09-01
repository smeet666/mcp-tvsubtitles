/**
 * What the transport does with an answer that is not a page.
 *
 * Each case here is a way a read can fail that the site or the network can
 * produce on its own: a refusal naming a delay in a wording nobody can act on,
 * a status that means "busy" rather than "no", a body that never arrives, a
 * redirect off the site, and a body larger than one answer is allowed to hold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Config, loadConfig } from "../../src/config.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { parseRetryAfter } from "../../src/tvsubtitles/http.js";
import { NOW, type Site, fails, fixture, html, silentLogger, site, succeeds } from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe("the delay a refusal names", () => {
  it("is nothing when the header carries only whitespace", () => {
    expect(parseRetryAfter("   ")).toBeNull();
  });

  it("is nothing when the header names a negative number of seconds", () => {
    // A negative delay is an impossible instruction. Reading it as a date
    // instead would parse it as a year and clamp it to zero, which turns a
    // header saying something impossible into one saying "come back at once".
    expect(parseRetryAfter("-30")).toBeNull();
  });

  it("is nothing when the header is neither a number nor a date", () => {
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("a status that means the site is busy", () => {
  it("is tried again, and the page the site finally served is the answer", async () => {
    let served = 0;
    const where = site([
      [
        /tvshows/,
        (call) => {
          served += 1;
          return served === 1
            ? html("<p>busy</p>", call.url, 500)
            : html(fixture("shows-index"), call.url);
        },
      ],
    ]);

    const read = await succeeds(clientOn(where).listShows());

    expect(where.calls.length).toBe(2);
    expect(read.data.shows.length).toBeGreaterThan(0);
  });
});

describe("a refusal whose body is never read", () => {
  it("still reports the refusal when the body cannot be let go of", async () => {
    // Cancelling a stream that is already gone raises, and that failure says
    // nothing about the answer: a 404 stays not_found rather than becoming a
    // transport fault.
    const where = site([
      [
        /tvshows/,
        () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode("<p>gone</p>"));
              },
              cancel() {
                throw new Error("this stream is already gone");
              },
            }),
            { status: 404 },
          ),
      ],
    ]);

    expect((await fails(clientOn(where).listShows())).code).toBe("not_found");
  });

  it("reports the refusal when the answer carried no body at all", async () => {
    const where = site([[/tvshows/, () => new Response(null, { status: 404 })]]);

    expect((await fails(clientOn(where).listShows())).code).toBe("not_found");
  });
});

describe("an attempt that raised rather than answered", () => {
  it("is a network_error when the transport threw something that is not an Error", async () => {
    const where = site([
      // A transport that rejects with a plain string rather than an Error: the
      // failure still has to be reported with the code a caller branches on.
      [/tvshows/, () => Promise.reject("the socket went away") as Promise<Response>],
    ]);

    expect((await fails(clientOn(where, { maxRetries: 0 }).listShows())).code).toBe(
      "network_error",
    );
  });

  it("is tried once more when the first attempt was abandoned before an answer", async () => {
    let served = 0;
    const where = site([
      [
        /tvshows/,
        (call) => {
          served += 1;
          if (served === 1) {
            const abort = new Error("aborted");
            abort.name = "AbortError";
            throw abort;
          }
          return html(fixture("shows-index"), call.url);
        },
      ],
    ]);

    const read = await succeeds(clientOn(where).listShows());

    expect(where.calls.length).toBe(2);
    expect(read.data.shows.length).toBeGreaterThan(0);
  });
});

describe("where a page was finally served from", () => {
  it("is the address that was asked for when the answer names none", async () => {
    // A response carrying no address of its own is the answer to the address
    // that was asked for, so the guards that read a path have one to read.
    const where = site([
      [
        /tvshows/,
        () =>
          new Response(fixture("shows-index"), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      ],
    ]);

    const read = await succeeds(clientOn(where).listShows());

    expect(read.data.shows.length).toBeGreaterThan(0);
  });

  it("is refused when the read was sent to another host", async () => {
    // Every guard against a substituted page reads a path and not a host, so a
    // page from elsewhere would pass all of them while being credited here.
    const where = site([
      [/tvshows/, () => html(fixture("shows-index"), "https://example.invalid/tvshows.html")],
    ]);

    const failure = await fails(clientOn(where).listShows());

    expect(failure.code).toBe("network_error");
    expect(failure.message).toContain("https://example.invalid");
  });

  it("reads an answer that arrived with an empty body as an unreadable page", async () => {
    const where = site([[/tvshows/, () => new Response(null, { status: 200 })]]);

    expect((await fails(clientOn(where).listShows())).code).toBe("parse_failure");
  });
});

describe("a body larger than one answer holds", () => {
  it("is parse_failure even when the stream cannot be let go of afterwards", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const where = site([
      [
        /tvshows/,
        () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                controller.enqueue(chunk);
              },
              cancel() {
                throw new Error("this stream is already gone");
              },
            }),
            { status: 200, headers: { "content-type": "text/html" } },
          ),
      ],
    ]);

    const failure = await fails(clientOn(where, { maxBodyBytes: 8192 }).listShows());

    expect(failure.code).toBe("parse_failure");
    expect(failure.message).toContain("8192");
  });
});

describe("the runtime's own fetch", () => {
  it("is what a client reads with when its caller hands over none", async () => {
    const where = site([[/tvshows/, (call) => html(fixture("shows-index"), call.url)]]);
    vi.stubGlobal("fetch", where.impl);

    const client = new TvSubtitlesClient({
      config: { ...loadConfig({}) },
      logger: silentLogger(),
    });
    const read = await succeeds(client.listShows());

    expect(where.calls.length).toBe(1);
    expect(read.data.shows.length).toBeGreaterThan(0);
  });
});
