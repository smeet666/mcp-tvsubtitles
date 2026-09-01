/**
 * Settings, read from the environment.
 *
 * A value that cannot be read warns and falls back rather than stopping the
 * server: a typo in one variable should not take away every tool. Warnings go
 * to stderr, because stdout carries the protocol and anything written there
 * corrupts the session.
 */

import process from "node:process";
import { PKG_VERSION, REPO_URL } from "./version.js";

export const LOG_LEVELS = ["silent", "error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * The site serves no robots.txt and publishes no crawl delay, so this floor is
 * chosen rather than read. A site that has written nothing has granted nothing,
 * which is a reason to be slower than a published limit would require. It is
 * not negotiable from the outside: configuration can widen the gap, never
 * narrow it.
 */
export const MIN_ALLOWED_INTERVAL_MS = 1500;
/** Beyond this a request would look hung rather than paced. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

export interface Config {
  userAgent: string;
  maxBodyBytes: number;
  budgetMs: number;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-tvsubtitles/${PKG_VERSION} (+${REPO_URL})`;

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

const PREFIX = "[mcp-tvsubtitles]";

export function createLogger(level: LogLevel): Logger {
  const rank = LOG_LEVELS.indexOf(level);
  /**
   * `survivesAt` decides whether the line is written, `label` says what it is.
   * Keeping the two apart is what lets a warning pass at the default setting
   * while still reading as a warning: a line labelled with the threshold it
   * survived would make "rows were dropped" indistinguishable from a failure.
   */
  const write = (label: string, survivesAt: LogLevel, message: string): void => {
    if (rank === 0 || LOG_LEVELS.indexOf(survivesAt) > rank) {
      return;
    }
    process.stderr.write(`${PREFIX} ${label}: ${message}\n`);
  };
  return {
    debug: (m) => write("debug", "debug", m),
    info: (m) => write("info", "info", m),
    // A warning goes out at the error threshold so it survives the default
    // setting: a caller has to know that rows were dropped.
    warn: (m) => write("warn", "error", m),
    error: (m) => write("error", "error", m),
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!(Number.isFinite(value) && Number.isInteger(value))) {
    process.stderr.write(
      `${PREFIX} error: ${name}="${raw}" is not a whole number; using ${fallback}.\n`,
    );
    return fallback;
  }
  if (value < min || value > max) {
    // Clamping silently would let a caller believe a setting took effect when
    // the opposite is true, so the refusal is stated and the default stands.
    process.stderr.write(
      `${PREFIX} error: ${name}=${value} is outside ${min}..${max}; using ${fallback}.\n`,
    );
    return fallback;
  }
  return value;
}

/**
 * Hold a settings object to what this server owes the site.
 *
 * `loadConfig` guards what the environment sets, and that guard reaches only
 * the settings this executable reads for itself. A program importing the
 * published client entry point builds its own object and hands it over whole,
 * which is the other way in and the one a floor written into the reader alone
 * would leave open. Every path that produces settings passes through here.
 */
export function enforceFloors(config: Config): Config {
  const asked = config.minIntervalMs;
  // A value that is not a usable number cannot be compared into place, so the
  // floor stands rather than the comparison silently letting it through.
  const paced =
    Number.isFinite(asked) && asked >= MIN_ALLOWED_INTERVAL_MS
      ? Math.min(asked, MAX_ALLOWED_INTERVAL_MS)
      : MIN_ALLOWED_INTERVAL_MS;
  if (paced !== asked) {
    // Named for what was actually wrong with it: a value pushed up to the floor
    // and one pulled down to the ceiling are two different mistakes, and one
    // message for both tells half the callers the opposite of what happened.
    const wrong =
      paced === MIN_ALLOWED_INTERVAL_MS
        ? `is below the ${MIN_ALLOWED_INTERVAL_MS}ms floor this server keeps`
        : `is above the ${MAX_ALLOWED_INTERVAL_MS}ms ceiling, past which a request looks hung rather than paced`;
    process.stderr.write(
      `${PREFIX} error: a minimum interval of ${asked}ms ${wrong}; using ${paced}.\n`,
    );
  }

  return { ...config, minIntervalMs: paced, userAgent: identify(config.userAgent) };
}

/**
 * The agent string sent to the site, whatever the caller set.
 *
 * The site has to be able to reach a person about traffic it did not expect, so
 * the project identifier and the contact address are appended rather than
 * replaced. A caller who wants to be recognised is, in front of them.
 */
function identify(userAgent: string): string {
  const trimmed = userAgent.trim();
  if (trimmed === "") {
    return DEFAULT_USER_AGENT;
  }
  return trimmed.endsWith(DEFAULT_USER_AGENT) ? trimmed : `${trimmed} ${DEFAULT_USER_AGENT}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Trimmed before it is judged: a variable holding only spaces is one nobody
  // set, and complaining about it would report a mistake that was never made.
  const level = env.TVS_LOG_LEVEL?.trim();
  const named = level === undefined || level === "" ? undefined : (level as LogLevel);
  const logLevel = named && LOG_LEVELS.includes(named) ? named : "error";
  if (named && !LOG_LEVELS.includes(named)) {
    process.stderr.write(
      `${PREFIX} error: TVS_LOG_LEVEL="${named}" is not one of ${LOG_LEVELS.join(", ")}; using error.\n`,
    );
  }

  const custom = env.TVS_USER_AGENT?.trim();

  return enforceFloors({
    userAgent: custom ?? "",
    minIntervalMs: readInteger(
      env,
      "TVS_MIN_INTERVAL_MS",
      2000,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    timeoutMs: readInteger(env, "TVS_TIMEOUT_MS", 20_000, 1000, 120_000),
    maxRetries: readInteger(env, "TVS_MAX_RETRIES", 3, 0, 8),
    // The show index is one page listing the whole catalogue and it changes on
    // the scale of weeks, so it is worth holding on to longer than a season
    // page whose newest episode arrives daily.
    cacheTtlMs: readInteger(env, "TVS_CACHE_TTL_MS", 900_000, 0, 86_400_000),
    cacheMaxEntries: readInteger(env, "TVS_CACHE_MAX_ENTRIES", 200, 1, 5000),
    // The show index runs to six hundred kilobytes and is the largest page the
    // site serves. Past this the read is abandoned rather than held whole in
    // memory, because a body that arrives quickly is never abandoned by a
    // deadline.
    maxBodyBytes: readInteger(env, "TVS_MAX_BODY_BYTES", 8_000_000, 100_000, 64_000_000),
    // One read owes the caller an answer inside this, retries and the waits
    // between them included. The deadline above governs one attempt, and a
    // refusal naming a delay is obeyed, so without a budget the two add up to
    // minutes on the single queue every other tool waits behind.
    budgetMs: readInteger(env, "TVS_BUDGET_MS", 60_000, 5000, 600_000),
    logLevel,
  });
}
