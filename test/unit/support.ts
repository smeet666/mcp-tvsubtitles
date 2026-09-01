/**
 * What every unit test here shares: a pinned clock, a fake site built from the
 * generated corpus, and a way to drive a pending call to its end without ever
 * consulting the machine's own clock.
 */

import { readFileSync } from "node:fs";
import { expect, vi } from "vitest";
import type { Logger } from "../../src/config.js";

/** The instant every test runs at, so no answer depends on the day. */
export const NOW = new Date("2026-01-01T00:00:00Z");

export function silentLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

export function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}.html`, import.meta.url), "utf8");
}

export interface Call {
  /** The instant the attempt was made, read off the pinned clock. */
  readonly at: number;
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | null;
}

/** An HTML answer, carrying the address it was finally served from. */
export function html(body: string, servedFrom: string, status = 200): Response {
  const response = new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(response, "url", { value: servedFrom });
  return response;
}

export type Responder = (call: Call) => Response | Promise<Response>;

/** What a POST carried, as a string, or nothing when it carried nothing. */
function readBody(bodyInit: RequestInit["body"]): string | null {
  if (bodyInit === undefined || bodyInit === null) {
    return null;
  }
  return typeof bodyInit === "string" ? bodyInit : String(bodyInit);
}

export interface Site {
  readonly calls: Call[];
  readonly impl: typeof fetch;
}

/**
 * A stand-in for the site: each route is a pattern the address has to hold and
 * the answer it earns. An address no route claims fails the test rather than
 * reaching the network.
 */
export function site(routes: [RegExp, Responder][]): Site {
  const calls: Call[] = [];
  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    const bodyInit = init?.body;
    const call: Call = {
      at: Date.now(),
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: new Headers(init?.headers),
      body: readBody(bodyInit),
    };
    calls.push(call);
    for (const [pattern, responder] of routes) {
      if (pattern.test(url)) {
        return await responder(call);
      }
    }
    throw new Error(`no route serves ${url}`);
  };
  return { calls, impl };
}

/** A site that answers every address with the same page. */
export function serving(body: string, servedFrom: string): Site {
  return site([[/./, () => html(body, servedFrom)]]);
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Drives a pending promise to its end on the fake clock. The step is small
 * enough that no wait is stepped over, and the budget is far larger than any
 * wait the code can ask for, so no test needs to know a backoff duration.
 */
export async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  let outcome: Settled<T> | undefined;
  promise.then(
    (value) => {
      outcome = { ok: true, value };
    },
    (error: unknown) => {
      outcome = { ok: false, error };
    },
  );
  for (let step = 0; step < 4000 && outcome === undefined; step += 1) {
    await vi.advanceTimersByTimeAsync(250);
  }
  if (outcome === undefined) {
    throw new Error("the call never settled on the fake clock");
  }
  return outcome;
}

export async function succeeds<T>(promise: Promise<T>): Promise<T> {
  const result = await settle(promise);
  if (!result.ok) {
    throw new Error(`expected a resolution, rejected with ${String(result.error)}`);
  }
  return result.value;
}

/** The error a call earned, with the code a caller branches on. */
export async function fails(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  const result = await settle(promise);
  if (result.ok) {
    throw new Error(`expected a rejection, resolved with ${JSON.stringify(result.value)}`);
  }
  const error = result.error as { code?: unknown; message?: unknown };
  expect(typeof error.code, `the rejection carries no code: ${String(result.error)}`).toBe(
    "string",
  );
  return { code: String(error.code), message: String(error.message) };
}

/** Every address the site serves, answered out of the generated corpus. */
export function wholeSite(overrides: [RegExp, Responder][] = []): Site {
  return site([
    ...overrides,
    [/\/tvshows\.html/, (call) => html(fixture("shows-index"), call.url)],
    [/search1\.php/, (call) => html(fixture("search-matches"), call.url)],
    [/\/tvshow-\d+-9\.html/, (call) => html(fixture("season-past-last"), call.url)],
    [/\/tvshow-/, (call) => html(fixture("season-full"), call.url)],
    // The episode one language holds exactly one record of.
    [
      /\/episode-52119(-en)?\.html/,
      (call) => html(fixture("episode-slack-water-english"), call.url),
    ],
    [
      /\/episode-52119-[a-z]{2}\.html/,
      (call) => html(fixture("episode-slack-water-empty"), call.url),
    ],
    // The episode the season page lists with every flag blank.
    [/\/episode-52120/, (call) => html(fixture("episode-language-empty"), call.url)],
    [/\/episode-\d+-en\.html/, (call) => html(fixture("episode-one-language"), call.url)],
    [/\/episode-\d+-fr\.html/, (call) => html(fixture("episode-language-french"), call.url)],
    [/\/episode-\d+-[a-z]{2}\.html/, (call) => html(fixture("episode-language-empty"), call.url)],
    [/\/episode-/, (call) => html(fixture("episode-many-languages"), call.url)],
    [/\/subtitle-/, (call) => html(fixture("subtitle-full"), call.url)],
    [/./, (call) => html(fixture("front-page"), call.url)],
  ]);
}

/** The text a client rendering only the text block would see. */
export function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}
