/**
 * The site, as a library.
 *
 * This layer never imports the MCP SDK. It holds the pacing, the cache, the
 * addresses and the reading of pages, so a program can depend on it as an
 * ordinary library with no protocol attached.
 *
 * It reads the catalogue and nothing else. No method fetches a subtitle file,
 * and none ever will: what a reader downloads, they download from the page this
 * server hands them.
 */

import { type Config, createLogger, enforceFloors, loadConfig, type Logger } from "../config.js";
import { invalidInput, notFound } from "../errors.js";
import type { Read } from "../types.js";
import { Cache } from "./cache.js";
import { fetchPage, type Page } from "./http.js";
import { type Language, resolveLanguage } from "./languages.js";
import type { SearchRow, ShowRow, SiteTotals } from "./parse.js";
import {
  parseEpisodeListing,
  parseSearchResults,
  parseSeasonPage,
  parseShowIndex,
  parseSiteTotals,
  parseSubtitleRecord,
  type SeasonPage,
  type SubtitleRecord,
} from "./parse.js";
import { RateLimiter } from "./rateLimiter.js";
import {
  episodeLanguageUrl,
  episodeUrl,
  isFrontPage,
  searchUrl,
  seasonUrl,
  showIndexUrl,
  subtitleUrl,
} from "./urls.js";

export interface ClientOptions {
  config?: Partial<Config>;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

export type {
  EpisodeRow,
  SearchRow,
  SeasonPage,
  ShowRow,
  SiteTotals,
  SubtitleRecord,
} from "./parse.js";

/**
 * The language a caller named, refused by name when the site draws no flag for it.
 *
 * Kept beside the client rather than inside it: it reaches no network and holds
 * no state, so a caller resolving a name before opening a client can.
 */
export function requireLanguage(named: string): Language {
  const language = resolveLanguage(named);
  if (!language) {
    throw invalidInput(
      `tvsubtitles.net holds no language called '${named}'.`,
      "Call list_languages to see the twenty-four it holds, each with the name and the code it answers to.",
    );
  }
  return language;
}

export class TvSubtitlesClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  private readonly cache: Cache<Page>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: ClientOptions = {}) {
    // Guarded after the merge, not before: settings handed in whole are the
    // other way into this constructor, and a floor applied only to what the
    // environment set would leave that one open.
    this.config = enforceFloors({ ...loadConfig(), ...options.config });
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ intervalMs: this.config.minIntervalMs });
    this.cache = new Cache<Page>(this.config.cacheTtlMs, this.config.cacheMaxEntries);
    this.fetchImpl = options.fetchImpl;
  }

  /** The spacing in force, which an answer reports rather than guesses. */
  get intervalMs(): number {
    return this.limiter.currentIntervalMs;
  }

  /**
   * Fetch a page, read it, and serve a repeat from memory.
   *
   * `interpret` runs before the store is written, which is what keeps an
   * unreadable answer out of it: a page nobody could read would otherwise be
   * served back for the lifetime of an entry, so one bad minute at the site
   * would freeze this client until the entry expired. Reading is therefore the
   * gate rather than a step the caller takes afterwards.
   *
   * A form makes the read a POST, and its fields are part of what identifies
   * the entry.
   */
  private async read<T>(
    url: string,
    interpret: (page: Page) => T,
    form?: Readonly<Record<string, string>>,
  ): Promise<{ value: T; cached: boolean }> {
    const key = form ? `${url}?${new URLSearchParams(form).toString()}` : url;
    const held = this.cache.get(key);
    if (held) {
      this.logger.debug(`cache hit ${key}`);
      return { value: interpret(held), cached: true };
    }

    const page = await this.limiter.schedule(() =>
      fetchPage({
        url,
        ...(form ? { form } : {}),
        userAgent: this.config.userAgent,
        timeoutMs: this.config.timeoutMs,
        maxBodyBytes: this.config.maxBodyBytes,
        budgetMs: this.config.budgetMs,
        maxRetries: this.config.maxRetries,
        limiter: this.limiter,
        logger: this.logger,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      }),
    );
    const value = interpret(page);
    this.cache.set(key, page);
    return { value, cached: false };
  }

  /** Every show the site holds, with the payload rows dropped and counted. */
  async listShows(): Promise<Read<{ shows: ShowRow[]; totals: SiteTotals }>> {
    const { value, cached } = await this.read(showIndexUrl(), (page) => ({
      index: parseShowIndex(page.body),
      totals: parseSiteTotals(page.body),
    }));
    const index = value.index;
    if (index.skipped > 0) {
      this.logger.warn(`${index.skipped} index rows were dropped as injection payloads`);
    }
    return {
      data: { shows: index.shows, totals: value.totals },
      cached,
      ...(index.skipped > 0 ? { skipped: index.skipped } : {}),
    };
  }

  /** Ask the site's own search, which it takes as a form rather than an address. */
  async searchShows(query: string): Promise<Read<{ rows: SearchRow[]; totals: SiteTotals }>> {
    const trimmed = query.trim();
    if (trimmed === "") {
      throw invalidInput("A search needs something to look for.", "Pass a show name in 'query'.");
    }
    const { value, cached } = await this.read(
      searchUrl(),
      (page) => ({ found: parseSearchResults(page.body), totals: parseSiteTotals(page.body) }),
      { qs: trimmed },
    );
    const found = value.found;
    return {
      data: { rows: found.rows, totals: value.totals },
      cached,
      ...(found.skipped > 0 ? { skipped: found.skipped } : {}),
    };
  }

  /**
   * One season of one show.
   *
   * Season 0 asks the site for its newest season, and the page says which one it
   * answered with. Two absences are read from the page rather than from a status
   * the site never sends: a show it does not hold comes back with an empty name,
   * and a season past the last one comes back with the show's real name, its
   * real list of seasons, and no rows. Reporting that second one as a season
   * holding zero episodes would state that the season exists, which the list of
   * seasons on the same page contradicts.
   */
  async getSeason(showId: number, season: number): Promise<Read<SeasonPage>> {
    const { value: parsed, cached } = await this.read(seasonUrl(showId, season), (page) =>
      parseSeasonPage(page.body, showId),
    );
    if (!parsed) {
      throw notFound(`tvsubtitles.net holds no show numbered ${showId}.`, {
        url: seasonUrl(showId, season),
        hint: "Show ids come back from search_titles. The site answers an id it does not hold with a page rather than a refusal.",
      });
    }
    // The list of seasons is the site's own statement of what it holds, so a
    // season absent from it is absent whatever the page's status said. A page
    // publishing no list at all establishes nothing, and is left to speak for
    // itself.
    if (parsed.seasonsAvailable.length > 0 && !parsed.seasonsAvailable.includes(parsed.season)) {
      const held = `${parsed.seasonsAvailable.length === 1 ? "season" : "seasons"} ${parsed.seasonsAvailable.join(", ")}`;
      // The seasons it does hold belong in the message rather than only in the
      // hint: a caller reading the rejection alone has to be able to ask again
      // without a second round trip.
      throw notFound(
        `tvsubtitles.net holds no season ${parsed.season} of ${parsed.showName}. It holds ${held}.`,
        {
          url: seasonUrl(showId, season),
          hint: `Ask for one of ${held}, or leave the season out to read the newest.`,
        },
      );
    }
    if (parsed.skipped > 0) {
      this.logger.warn(
        `${parsed.skipped} episode rows of season ${parsed.season} came back too incomplete to read`,
      );
    }
    return { data: parsed, cached, ...(parsed.skipped > 0 ? { skipped: parsed.skipped } : {}) };
  }

  /**
   * The subtitles one episode holds, in one language or in all of them.
   *
   * The site serves both from one shape, and each row names its own language,
   * so reading every language costs the same single request as reading one.
   */
  async listEpisodeSubtitles(
    episodeId: number,
    language?: Language,
  ): Promise<Read<SubtitleRecord[]>> {
    const url = language ? episodeLanguageUrl(episodeId, language.siteCode) : episodeUrl(episodeId);
    const { value: listing, cached } = await this.read(url, (page) =>
      parseEpisodeListing(page.body),
    );
    if (!listing) {
      throw notFound(`tvsubtitles.net holds no episode numbered ${episodeId}.`, { url });
    }
    if (listing.skipped > 0) {
      this.logger.warn(`${listing.skipped} blocks of episode ${episodeId} named no record`);
    }
    return {
      data: listing.rows,
      cached,
      ...(listing.skipped > 0 ? { skipped: listing.skipped } : {}),
    };
  }

  /**
   * One subtitle's record.
   *
   * A subtitle id the site does not hold is answered by sending the reader to
   * the front page, so a read that finishes there is the absence.
   */
  async getSubtitle(subtitleId: number): Promise<Read<SubtitleRecord>> {
    const url = subtitleUrl(subtitleId);
    const { value, cached } = await this.read(url, (page) =>
      // Where the read finished is the absence, so it is settled before the
      // body is read: parsing the front page would fail on a page the site
      // served on purpose, reporting a fault where there is only a missing id.
      isFrontPage(page.url) ? null : parseSubtitleRecord(page.body, subtitleId),
    );
    if (!value) {
      throw notFound(`tvsubtitles.net holds no subtitle numbered ${subtitleId}.`, { url });
    }
    return { data: value, cached };
  }
}
