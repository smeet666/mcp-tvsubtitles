/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one store are shared by every tool, so
 * pacing applies to the server as a whole rather than per tool. Tools are
 * registered in a fixed order, which is what lets a client cache the listing.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import type { GetSubtitleArgs } from "./tools/getSubtitle.js";
import {
  getSubtitleArgs,
  getSubtitleDescription,
  getSubtitleOutputShape,
  runGetSubtitle,
} from "./tools/getSubtitle.js";
import type { ListLanguagesArgs } from "./tools/listLanguages.js";
import {
  listLanguagesArgs,
  listLanguagesDescription,
  listLanguagesOutputShape,
  runListLanguages,
} from "./tools/listLanguages.js";
import type { ListSubtitlesArgs } from "./tools/listSubtitles.js";
import {
  listSubtitlesArgs,
  listSubtitlesDescription,
  listSubtitlesOutputShape,
  runListSubtitles,
} from "./tools/listSubtitles.js";
import type { SearchTitlesArgs } from "./tools/searchTitles.js";
import {
  runSearchTitles,
  searchTitlesArgs,
  searchTitlesDescription,
  searchTitlesOutputShape,
} from "./tools/searchTitles.js";
import { toToolError } from "./tools/shared.js";
import { TvSubtitlesClient } from "./tvsubtitles/client.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** This server only reads, so every tool is read-only. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const INSTRUCTIONS = [
  "Tools for reading the subtitle catalogue of tvsubtitles.net. No API key and no account are needed.",
  "The site catalogues television series only, so search_titles refuses 'movie' rather than answering it with an empty list.",
  "Typical flow: search_titles to find a series and its id, then list_subtitles on that id, then get_subtitle on a record.",
  "Ids are never built by hand. The site answers a show id it does not hold with a page carrying an empty name, and a subtitle id it does not hold by sending the reader to its front page, so a guessed id reads as an absence nobody established.",
  "list_subtitles answers in one of two shapes and 'kind' says which. With a season alone it answers that season's coverage, one row per episode saying which languages hold something. Add an episode and it answers the records themselves.",
  "Leaving 'season' out reads the newest season the site holds, and the answer states which one that was under 'season' beside the 'season_requested' that was asked for.",
  "Call list_languages before narrowing by language. The site names its languages its own way and six of its codes differ from ISO 639-1, one of them colliding: it writes 'br' for Brazilian Portuguese, which ISO assigns to Breton. Called with a show id it reads what that show holds over one season, and 'scope' says which of the two was measured.",
  "A language that holds nothing is set aside rather than reported as an absence: the answer comes back unnarrowed and 'filters_dropped' names what was put aside.",
  "Read 'release_match' before matching a subtitle to a video file. 'stated' means the site published the release, and 'none' means it published nothing, so the record says nothing about which video it is timed to.",
  "The site publishes no marker for hearing-impaired subtitles and none for machine translation, so both are null and no answer infers them. It holds no season packs, so every record counts one episode.",
  "A field the site printed nothing for is null, never zero. The two rating counters are an exception the other way: the site publishes them and its readers barely use them, so a zero there is a figure the site printed.",
  "The site serves rows written into its catalogue through its own add form which are attack payloads rather than series. They are dropped before an answer is built, and the notes say how many.",
  "This server reads the catalogue and downloads no subtitle file. Every record carries 'page_url', which is where a reader downloads it themselves.",
  "This server paces itself, and a rate_limited error means the site asked it to slow down, never that nothing matched.",
  "When you show a result to a user, credit tvsubtitles.net and link the page.",
].join(" ");

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new TvSubtitlesClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-tvsubtitles", version: PKG_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "search_titles",
    {
      title: "Search television series",
      description: searchTitlesDescription,
      inputSchema: searchTitlesArgs,
      outputSchema: z.object(searchTitlesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runSearchTitles(client, args as SearchTitlesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "list_subtitles",
    {
      title: "List a season's coverage or an episode's subtitles",
      description: listSubtitlesDescription,
      inputSchema: listSubtitlesArgs,
      outputSchema: z.object(listSubtitlesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runListSubtitles(client, args as ListSubtitlesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "get_subtitle",
    {
      title: "Read one subtitle's record",
      description: getSubtitleDescription,
      inputSchema: getSubtitleArgs,
      outputSchema: z.object(getSubtitleOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runGetSubtitle(client, args as GetSubtitleArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "list_languages",
    {
      title: "List the languages the catalogue holds",
      description: listLanguagesDescription,
      inputSchema: listLanguagesArgs,
      outputSchema: z.object(listLanguagesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runListLanguages(client, args as ListLanguagesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
