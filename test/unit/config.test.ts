import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_AGENT,
  LOG_LEVELS,
  MAX_ALLOWED_INTERVAL_MS,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../../src/config.js";

let stdoutLines: string[] = [];
let stderrLines: string[] = [];

function decode(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return new TextDecoder().decode(chunk);
  }
  return String(chunk);
}

beforeEach(() => {
  stdoutLines = [];
  stderrLines = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    stdoutLines.push(decode(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderrLines.push(decode(chunk));
    return true;
  }) as typeof process.stderr.write);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the pace floor", () => {
  it("holds when the environment asks for a shorter interval", () => {
    const config = loadConfig({ TVS_MIN_INTERVAL_MS: "1" });

    expect(config.minIntervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
  });

  it("holds against zero, against a negative number and against nonsense", () => {
    for (const asked of ["0", "-5000", "not a number", ""]) {
      const config = loadConfig({ TVS_MIN_INTERVAL_MS: asked });

      expect(
        config.minIntervalMs,
        `TVS_MIN_INTERVAL_MS=${asked} lowered the floor`,
      ).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    }
  });

  it("lets the environment widen the interval, which owes the site nothing", () => {
    const config = loadConfig({ TVS_MIN_INTERVAL_MS: "9000" });

    expect(config.minIntervalMs).toBe(9000);
  });

  it("is at least a second, since the site is a free catalogue", () => {
    expect(MIN_ALLOWED_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe("the User-Agent", () => {
  it("names the project and an address where a person answers", () => {
    expect(DEFAULT_USER_AGENT).toContain("mcp-tvsubtitles");
    expect(DEFAULT_USER_AGENT).toMatch(/https?:\/\/\S+/);
  });

  it("keeps the project identifier and the contact address behind what a caller sets", () => {
    const config = loadConfig({ TVS_USER_AGENT: "some-other-agent/1.0" });

    expect(config.userAgent).toContain("some-other-agent/1.0");
    expect(config.userAgent).toContain("mcp-tvsubtitles");
    expect(config.userAgent).toMatch(/https?:\/\/\S+/);
    expect(config.userAgent.endsWith(DEFAULT_USER_AGENT)).toBe(true);
  });
});

describe("loadConfig", () => {
  it("answers an empty environment with every field it declares", () => {
    const config = loadConfig({});

    expect(config.minIntervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(config.maxRetries).toBeGreaterThanOrEqual(0);
    expect(config.cacheTtlMs).toBeGreaterThanOrEqual(0);
    expect(config.cacheMaxEntries).toBeGreaterThan(0);
    expect(LOG_LEVELS).toContain(config.logLevel);
    expect(config.userAgent).toBe(DEFAULT_USER_AGENT);
  });

  it("writes nothing at all to stdout, which carries the protocol", () => {
    loadConfig({ TVS_LOG_LEVEL: "debug", TVS_MIN_INTERVAL_MS: "nonsense" });

    expect(stdoutLines).toEqual([]);
  });
});

describe("createLogger", () => {
  it("writes on stderr and never on stdout", () => {
    const logger = createLogger("debug");

    logger.debug("a debug line");
    logger.info("an info line");
    logger.warn("a warning");
    logger.error("a failure");

    expect(stdoutLines).toEqual([]);
    expect(stderrLines.join("")).toContain("a failure");
  });

  it("says nothing at all at its quietest level", () => {
    const logger = createLogger("silent");

    logger.debug("a debug line");
    logger.info("an info line");
    logger.warn("a warning");
    logger.error("a failure");

    expect(stdoutLines).toEqual([]);
    expect(stderrLines).toEqual([]);
  });
});

describe("the ceiling on the interval", () => {
  it("caps an interval wider than this server will wait between two reads", () => {
    const config = loadConfig({ TVS_MIN_INTERVAL_MS: String(MAX_ALLOWED_INTERVAL_MS * 10) });

    expect(config.minIntervalMs).toBeLessThanOrEqual(MAX_ALLOWED_INTERVAL_MS);
  });

  it("leaves the ceiling itself untouched", () => {
    const config = loadConfig({ TVS_MIN_INTERVAL_MS: String(MAX_ALLOWED_INTERVAL_MS) });

    expect(config.minIntervalMs).toBe(MAX_ALLOWED_INTERVAL_MS);
  });

  it("holds a ceiling above the floor, so the two bounds leave a range", () => {
    expect(MAX_ALLOWED_INTERVAL_MS).toBeGreaterThan(MIN_ALLOWED_INTERVAL_MS);
  });
});

describe("the log level", () => {
  it("takes each level the module publishes", () => {
    for (const level of LOG_LEVELS) {
      expect(loadConfig({ TVS_LOG_LEVEL: level }).logLevel).toBe(level);
    }
  });

  it("falls back to a level it publishes when handed one it does not", () => {
    expect(LOG_LEVELS).toContain(loadConfig({ TVS_LOG_LEVEL: "chatty" }).logLevel);
  });
});

describe("the other numbers the environment can set", () => {
  it("keeps each one inside bounds rather than taking it as typed", () => {
    const config = loadConfig({
      TVS_TIMEOUT_MS: "-1",
      TVS_MAX_RETRIES: "-1",
      TVS_CACHE_TTL_MS: "-1",
      TVS_CACHE_MAX_ENTRIES: "-1",
      TVS_MAX_BODY_BYTES: "-1",
      TVS_BUDGET_MS: "-1",
    });

    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(config.maxRetries).toBeGreaterThanOrEqual(0);
    expect(config.cacheTtlMs).toBeGreaterThanOrEqual(0);
    expect(config.cacheMaxEntries).toBeGreaterThan(0);
    expect(config.maxBodyBytes).toBeGreaterThan(0);
    expect(config.budgetMs).toBeGreaterThan(0);
  });

  it("takes a value inside bounds as it was given", () => {
    const config = loadConfig({
      TVS_TIMEOUT_MS: "9000",
      TVS_MAX_RETRIES: "1",
      TVS_CACHE_TTL_MS: "60000",
      TVS_CACHE_MAX_ENTRIES: "10",
    });

    expect(config.timeoutMs).toBe(9000);
    expect(config.maxRetries).toBe(1);
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.cacheMaxEntries).toBe(10);
  });

  it("keeps an empty user agent from erasing the one this server owes the site", () => {
    expect(loadConfig({ TVS_USER_AGENT: "   " }).userAgent).toBe(DEFAULT_USER_AGENT);
  });
});
