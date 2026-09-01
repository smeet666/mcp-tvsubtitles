/**
 * What a tool does with a question it cannot ask, and what a client does with
 * the settings it was handed none of.
 *
 * The schema refuses before any tool code runs, so a refusal has to open with
 * the same code whichever path produced it. The client is built two ways, from
 * settings handed over whole and from settings handed over in part, and the
 * second reads the environment for the rest.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import {
  NOW,
  type Site,
  fails,
  fixture,
  html,
  settle,
  silentLogger,
  succeeds,
  wholeSite,
} from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function clientOn(where: Site): TvSubtitlesClient {
  return new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: where.impl,
  });
}

function payloadOf(result: unknown): Record<string, unknown> {
  return (result as { structuredContent: Record<string, unknown> }).structuredContent;
}

describe("an argument a tool does not declare", () => {
  it("is refused by get_subtitle, which asks the site nothing", async () => {
    const where = wholeSite();

    const failure = await fails(
      runGetSubtitle(clientOn(where), { id: "880431", format: "srt" } as never),
    );

    expect(failure.code).toBe("invalid_input");
    expect(failure.message).toContain("'format'");
    expect(where.calls).toHaveLength(0);
  });

  it("is refused by list_languages, which asks the site nothing", async () => {
    const where = wholeSite();

    const failure = await fails(runListLanguages(clientOn(where), { locale: "fr" } as never));

    expect(failure.code).toBe("invalid_input");
    expect(failure.message).toContain("'locale'");
    expect(where.calls).toHaveLength(0);
  });

  it("is named without a suggestion when nothing declared could be what was meant", async () => {
    // A name carrying no letter or digit at all, and one longer than any name
    // anybody meant, are both left unnamed: a suggestion that misses sends a
    // caller to an argument answering a different question.
    const where = wholeSite();
    const client = clientOn(where);

    const punctuation = await fails(
      runSearchTitles(client, { query: "harbour", "-.-": 1 } as never),
    );
    expect(punctuation.message).toContain("'-.-'");
    expect(punctuation.message).not.toContain("did you mean");

    const veryLong = await fails(
      runSearchTitles(client, { query: "harbour", [`q${"u".repeat(90)}`]: 1 } as never),
    );
    expect(veryLong.message).not.toContain("did you mean");
  });

  it("is answered with the declared name it opens or closes", async () => {
    const failure = await fails(
      runListSubtitles(clientOn(wholeSite()), {
        id: "4210",
        episode_number: 7,
      } as never),
    );

    expect(failure.message).toContain("did you mean 'episode'");
  });
});

describe("a client handed only part of its settings", () => {
  it("reads the rest from the environment and keeps a logger of its own", async () => {
    const where = wholeSite();

    const client = new TvSubtitlesClient({
      config: { minIntervalMs: 5000, logLevel: "silent" },
      fetchImpl: where.impl,
    });

    expect(client.intervalMs).toBe(5000);
    expect((await succeeds(client.listShows())).data.shows.length).toBeGreaterThan(0);
  });
});

describe("a search with nothing to look for", () => {
  it("is refused rather than sent to the site as an empty form", async () => {
    const where = wholeSite();

    const failure = await fails(clientOn(where).searchShows("   "));

    expect(failure.code).toBe("invalid_input");
    expect(where.calls).toHaveLength(0);
  });
});

describe("a server built without a fetch of its own", () => {
  it("registers its four tools and asks the site nothing while doing it", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "defaults-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const listed = await settle(client.listTools());

    expect(listed.ok).toBe(true);
    expect(
      listed.ok ? (listed.value as { tools: { name: string }[] }).tools.map((t) => t.name) : [],
    ).toEqual(["search_titles", "list_subtitles", "get_subtitle", "list_languages"]);
    await server.close();
  });
});

describe("a failure inside a tool handler", () => {
  async function connected(fetchImpl: typeof fetch): Promise<Client> {
    const server = createServer({ fetchImpl });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "handler-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
  }

  it("reaches the caller of get_subtitle as a tool error opening with its code", async () => {
    const where = wholeSite([[/\/subtitle-/, (call) => html(fixture("unreadable"), call.url)]]);
    const client = await connected(where.impl);

    const outcome = await settle(
      client.callTool({ name: "get_subtitle", arguments: { id: "880431" } }),
    );

    expect(outcome.ok).toBe(true);
    const result = outcome.ok
      ? (outcome.value as { isError?: boolean; content: { text: string }[] })
      : null;
    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("[parse_failure]");
  });

  it("reaches the caller of list_languages as a tool error opening with its code", async () => {
    const where = wholeSite([[/\/tvshow-/, (call) => html(fixture("unreadable"), call.url)]]);
    const client = await connected(where.impl);

    const outcome = await settle(
      client.callTool({ name: "list_languages", arguments: { id: "4210" } }),
    );

    expect(outcome.ok).toBe(true);
    const result = outcome.ok
      ? (outcome.value as { isError?: boolean; content: { text: string }[] })
      : null;
    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("[parse_failure]");
  });
});

describe("a season the site prints no episode row for", () => {
  it("names the single season a show holds in the singular", async () => {
    const where = wholeSite([
      [/\/tvshow-4220-1\.html/, (call) => html(fixture("season-one-no-episodes"), call.url)],
    ]);

    const result = await succeeds(
      runListSubtitles(clientOn(where), { id: "4220", season: 1, limit: 10 }),
    );

    expect(
      (payloadOf(result).notes as string[]).some((note) => note.includes("It holds season 1.")),
    ).toBe(true);
  });
});

describe("a search matching several shows the index carries no row for", () => {
  it("says their counts are unknown in the plural", async () => {
    const where = wholeSite([
      [/search1\.php/, (call) => html(fixture("search-two-uncounted"), call.url)],
    ]);

    const result = await succeeds(
      runSearchTitles(clientOn(where), { query: "water", with_counts: true, limit: 10 }),
    );

    expect(
      (payloadOf(result).notes as string[]).some((note) =>
        note.includes("their counts are unknown rather than none"),
      ),
    ).toBe(true);
  });
});

describe("an episode read in a language whose own page came back empty", () => {
  /** The language page holds nothing while the episode's own page holds rows. */
  const disagreeing = (languagePage: string, wholePage: string): Site =>
    wholeSite([
      [/\/episode-52118-[a-z]{2}\.html/, (call) => html(fixture(languagePage), call.url)],
      [/\/episode-52118\.html/, (call) => html(fixture(wholePage), call.url)],
    ]);

  it("reads the one record the episode's own page holds in it", async () => {
    const where = disagreeing("episode-language-empty", "episode-many-languages");

    const result = await succeeds(
      runListSubtitles(clientOn(where), {
        id: "4210",
        season: 3,
        episode: 7,
        language: "french",
        limit: 10,
      }),
    );
    const payload = payloadOf(result);

    expect(payload.result_count).toBe(1);
    expect(payload.filters_dropped).toEqual([]);
    expect(
      (payload.notes as string[]).some((note) =>
        note.includes("the episode's own page holds a subtitle in it"),
      ),
    ).toBe(true);
  });

  it("reads the several records the episode's own page holds in it", async () => {
    const where = disagreeing("episode-language-empty", "episode-one-language");

    const result = await succeeds(
      runListSubtitles(clientOn(where), {
        id: "4210",
        season: 3,
        episode: 7,
        language: "english",
        limit: 10,
      }),
    );
    const payload = payloadOf(result);

    expect(payload.result_count).toBe(2);
    expect(
      (payload.notes as string[]).some((note) =>
        note.includes("the episode's own page holds subtitles in it"),
      ),
    ).toBe(true);
  });
});

describe("more records than the limit asked for", () => {
  it("says how many of them were rendered, so the rest are known to be there", async () => {
    const result = await succeeds(
      runListSubtitles(clientOn(wholeSite()), {
        id: "4210",
        season: 3,
        episode: 7,
        limit: 1,
      }),
    );
    const payload = payloadOf(result);

    expect(payload.result_count).toBe(1);
    expect(payload.total_available).toBe(3);
    expect(
      (payload.notes as string[]).some((note) =>
        note.includes("1 of the 3 records this episode holds are rendered here"),
      ),
    ).toBe(true);
  });
});

describe("a second reading of the same episode", () => {
  it("is reported as cached only when both pages it needed came from memory", async () => {
    const where = wholeSite();
    const client = clientOn(where);
    const args = { id: "4210", season: 3, episode: 7, limit: 10 } as const;

    const first = await succeeds(runListSubtitles(client, args));
    const second = await succeeds(runListSubtitles(client, args));

    expect(payloadOf(first).cached).toBe(false);
    expect(payloadOf(second).cached).toBe(true);
  });
});
