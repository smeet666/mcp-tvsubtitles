import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server.js";
import { loadConfig } from "../../src/config.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { runSearchTitles } from "../../src/tools/searchTitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { NOW, settle, silentLogger, wholeSite } from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function client(): TvSubtitlesClient {
  return new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: wholeSite().impl,
  });
}

/** The refusal a call earns, as the caller reads it. */
async function refusalOfSearch(value: Record<string, unknown>): Promise<string> {
  const outcome = await settle(
    runSearchTitles(client(), value as unknown as Parameters<typeof runSearchTitles>[1]),
  );
  if (outcome.ok) {
    return "the call was accepted";
  }
  return (outcome.error as Error).message;
}

async function refusalOfList(value: Record<string, unknown>): Promise<string> {
  const outcome = await settle(
    runListSubtitles(client(), value as unknown as Parameters<typeof runListSubtitles>[1]),
  );
  if (outcome.ok) {
    return "the call was accepted";
  }
  return (outcome.error as Error).message;
}

/** The wording by which a refusal points at a declared argument. */
const SUGGESTS = /\b(did you mean|do you mean|perhaps you meant|closest|suggest)\b/i;

describe("an argument the tool does not declare", () => {
  it("is refused, and the refusal names it", async () => {
    const message = await refusalOfSearch({ query: "harbour", sort: "year" });

    expect(message).not.toBe("the call was accepted");
    expect(message).toContain("sort");
  });

  it("names both of them, in the plural, when two are unknown at once", async () => {
    const message = await refusalOfSearch({ query: "harbour", sort: "year", order: "desc" });

    expect(message).toContain("sort");
    expect(message).toContain("order");
    expect(message).toMatch(/\barguments\b/i);
  });

  it("points at the declared name behind a respelling", async () => {
    for (const spelling of ["Year", "YEAR", "yeer"]) {
      const message = await refusalOfSearch({ query: "harbour", [spelling]: 2012 });

      expect(message, `${spelling} earned no suggestion`).toMatch(SUGGESTS);
      expect(message).toContain("year");
    }
  });

  it("suggests nothing for a name close to none of the declared ones", async () => {
    const message = await refusalOfSearch({ query: "harbour", broadcaster: "the harbour office" });

    expect(message).toContain("broadcaster");
    expect(message).not.toMatch(SUGGESTS);
  });
});

describe("an argument outside the bounds the schema publishes", () => {
  it("refuses a limit above the ceiling", async () => {
    expect(await refusalOfSearch({ query: "harbour", limit: 101 })).not.toBe(
      "the call was accepted",
    );
  });

  it("refuses a limit below one", async () => {
    expect(await refusalOfSearch({ query: "harbour", limit: 0 })).not.toBe("the call was accepted");
  });

  it("refuses an empty query", async () => {
    expect(await refusalOfSearch({ query: "" })).not.toBe("the call was accepted");
  });

  it("refuses a query longer than the schema allows", async () => {
    expect(await refusalOfSearch({ query: "a".repeat(121) })).not.toBe("the call was accepted");
  });

  it("refuses a season and an episode outside their ranges", async () => {
    expect(await refusalOfList({ id: "4210", season: 0 })).not.toBe("the call was accepted");
    expect(await refusalOfList({ id: "4210", season: 201 })).not.toBe("the call was accepted");
    expect(await refusalOfList({ id: "4210", season: 3, episode: 0 })).not.toBe(
      "the call was accepted",
    );
    expect(await refusalOfList({ id: "4210", season: 3, episode: 501 })).not.toBe(
      "the call was accepted",
    );
  });

  it("refuses an id longer than the schema allows", async () => {
    expect(await refusalOfList({ id: "4".repeat(13) })).not.toBe("the call was accepted");
  });

  it("refuses a year outside the range the schema publishes", async () => {
    expect(await refusalOfSearch({ query: "harbour", year: 1899 })).not.toBe(
      "the call was accepted",
    );
    expect(await refusalOfSearch({ query: "harbour", year: 2101 })).not.toBe(
      "the call was accepted",
    );
  });

  it("refuses an argument of the wrong type", async () => {
    expect(await refusalOfSearch({ query: 7 })).not.toBe("the call was accepted");
    expect(await refusalOfSearch({ query: "harbour", limit: "many" })).not.toBe(
      "the call was accepted",
    );
  });

  it("refuses a missing required argument", async () => {
    expect(await refusalOfSearch({})).not.toBe("the call was accepted");
    expect(await refusalOfList({})).not.toBe("the call was accepted");
  });
});

describe("every refusal, whichever bound raised it", () => {
  /**
   * A caller reads the code off the front of the message, so the refusal the
   * host renders is where it has to appear.
   */
  async function refusalText(name: string, args: Record<string, unknown>): Promise<string> {
    const server = createServer({ fetchImpl: wholeSite().impl });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const host = new Client({ name: "arguments-test", version: "0.0.0" });
    await Promise.all([host.connect(clientTransport), server.connect(serverTransport)]);
    const outcome = await settle(host.callTool({ name, arguments: args }));
    if (!outcome.ok) {
      return (outcome.error as Error).message;
    }
    const result = outcome.value as { isError?: boolean; content?: Array<{ text?: string }> };
    if (result.isError !== true) {
      return "the call was accepted";
    }
    return (result.content ?? []).map((block) => block.text ?? "").join("\n");
  }

  /** Each refusal, with the argument a caller has to be told to change. */
  const REFUSED: [string, string, Record<string, unknown>, string][] = [
    ["an undeclared argument", "search_titles", { query: "harbour", sort: "year" }, "sort"],
    ["a limit above the ceiling", "search_titles", { query: "harbour", limit: 101 }, "limit"],
    ["an empty query", "search_titles", { query: "" }, "query"],
    ["a query of the wrong type", "search_titles", { query: 7 }, "query"],
    ["a missing required argument", "search_titles", {}, "query"],
    ["a season out of range", "list_subtitles", { id: "4210", season: 0 }, "season"],
    [
      "a film, which this site holds none of",
      "search_titles",
      { query: "x", media_type: "movie" },
      "media_type",
    ],
    [
      "a language the site does not hold",
      "list_subtitles",
      { id: "4210", language: "klingon" },
      "language",
    ],
  ];

  for (const [what, name, args, faulty] of REFUSED) {
    it(`carries the code a caller branches on, for ${what}`, async () => {
      const message = await refusalText(name, args);

      expect(message, `the refusal read: ${message}`).toContain("[invalid_input]");
    });

    it(`names the argument at fault, for ${what}`, async () => {
      const message = await refusalText(name, args);

      expect(message, `the refusal read: ${message}`).toContain(faulty);
    });
  }
});

describe("list_languages", () => {
  it("refuses an argument it does not declare rather than answering as if it had none", async () => {
    const server = createServer({ fetchImpl: wholeSite().impl });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const host = new Client({ name: "arguments-test", version: "0.0.0" });
    await Promise.all([host.connect(clientTransport), server.connect(serverTransport)]);

    // 'id' and 'season' are what this tool declares, so the undeclared name has
    // to be a third one: a tool that takes no arguments at all and one that
    // takes two are refused by the same rule, and only a name outside the
    // declaration tests it.
    const outcome = await settle(
      host.callTool({ name: "list_languages", arguments: { show_id: "4210" } }),
    );

    expect(outcome.ok).toBe(true);
    expect((outcome as { value: { isError?: boolean } }).value.isError).toBe(true);
  });
});
