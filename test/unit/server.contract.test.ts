import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTRUCTIONS, createServer } from "../../src/server.js";
import { NOW, type Site, fixture, html, settle, site, wholeSite } from "./support.js";

/** The four tools, in the order the registration fixes. */
const TOOL_NAMES = ["search_titles", "list_subtitles", "get_subtitle", "list_languages"];

interface Published {
  name: string;
  description: string;
  annotations: Record<string, boolean>;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

function documented(): {
  serverInfo: { name: string; version: string };
  instructions: string;
  tools: Published[];
} {
  const raw = readFileSync(new URL("../../docs/TOOL-SCHEMAS.json", import.meta.url), "utf8");
  return JSON.parse(raw) as ReturnType<typeof documented>;
}

function packageVersion(): string {
  const raw = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

/** Reaching the network while a server is built or listed is a failure. */
const forbiddenFetch: typeof fetch = () => {
  throw new Error("the network was touched while building or listing");
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function connected(fetchImpl: typeof fetch = forbiddenFetch): Promise<Client> {
  const server = createServer({ fetchImpl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "contract-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function callOn(where: Site, name: string, args: Record<string, unknown>) {
  const client = await connected(where.impl);
  const outcome = await settle(client.callTool({ name, arguments: args }));
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
}

function errorTextOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).map((block) => block.text ?? "").join("\n");
}

describe("the server a host connects to", () => {
  it("announces itself under its package name and its released version", async () => {
    const client = await connected();
    const info = client.getServerVersion();

    expect(info?.name).toBe(documented().serverInfo.name);
    expect(info?.version).toBe(packageVersion());
  });

  it("hands the instructions to the client, word for word", async () => {
    const client = await connected();

    expect(client.getInstructions()).toBe(INSTRUCTIONS);
    expect(INSTRUCTIONS).toBe(documented().instructions);
  });

  it("asks nothing of the network while a client connects and lists", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const client = await connected();
    await client.listTools();

    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("registers the four tools in an order two builds agree on", async () => {
    const first = (await (await connected()).listTools()).tools.map((tool) => tool.name);
    const second = (await (await connected()).listTools()).tools.map((tool) => tool.name);

    expect(first).toEqual(TOOL_NAMES);
    expect(second).toEqual(first);
  });
});

describe("what every tool declares", () => {
  it("says it reads, destroys nothing and may be called twice", async () => {
    const { tools } = await (await connected()).listTools();

    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} is not read-only`).toBe(true);
      expect(tool.annotations?.destructiveHint, `${tool.name} is destructive`).toBe(false);
      expect(tool.annotations?.idempotentHint, `${tool.name} is not idempotent`).toBe(true);
    }
  });

  it("says it reaches a world outside this process", async () => {
    const { tools } = await (await connected()).listTools();

    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint, `${tool.name} declares a closed world`).toBe(true);
    }
  });

  it("carries a description and an output schema", async () => {
    const { tools } = await (await connected()).listTools();

    for (const tool of tools) {
      expect(
        (tool.description ?? "").length,
        `${tool.name} carries no description`,
      ).toBeGreaterThan(0);
      expect(tool.outputSchema, `${tool.name} declares no output schema`).toBeDefined();
    }
  });

  it("refuses an argument it does not declare", async () => {
    const { tools } = await (await connected()).listTools();

    for (const tool of tools) {
      expect(
        tool.inputSchema.additionalProperties,
        `${tool.name} accepts undeclared arguments`,
      ).toBe(false);
    }
  });
});

describe("the schemas this repository documents", () => {
  for (const name of TOOL_NAMES) {
    it(`match what the built server publishes for ${name}`, async () => {
      const { tools } = await (await connected()).listTools();
      const published = tools.find((tool) => tool.name === name);
      const written = documented().tools.find((tool) => tool.name === name);

      expect(published, `${name} is not registered`).toBeDefined();
      expect(written, `${name} is not documented`).toBeDefined();
      expect(published?.description).toBe(written?.description);
      expect(published?.annotations).toEqual(written?.annotations);
      expect(published?.inputSchema).toEqual(written?.inputSchema);
      expect(published?.outputSchema).toEqual(written?.outputSchema);
    });
  }

  it("document no tool the server does not register", async () => {
    const { tools } = await (await connected()).listTools();

    expect(documented().tools.map((tool) => tool.name)).toEqual(tools.map((tool) => tool.name));
  });
});

describe("a refusal, whichever path refuses", () => {
  it("opens with the code when the schema rejects an undeclared argument", async () => {
    const result = await callOn(wholeSite(), "search_titles", { query: "harbour", sort: "year" });

    expect(result.isError).toBe(true);
    expect(errorTextOf(result)).toContain("invalid_input");
  });

  it("opens with the code when the schema rejects a value out of bounds", async () => {
    const result = await callOn(wholeSite(), "search_titles", { query: "harbour", limit: 5000 });

    expect(result.isError).toBe(true);
    expect(errorTextOf(result)).toContain("invalid_input");
  });

  it("opens with the code when the tool's own code refuses a film", async () => {
    const result = await callOn(wholeSite(), "search_titles", {
      query: "harbour",
      media_type: "movie",
    });

    expect(result.isError).toBe(true);
    expect(errorTextOf(result)).toContain("invalid_input");
  });

  it("opens with the code when the tool's own code refuses a language", async () => {
    const result = await callOn(wholeSite(), "list_subtitles", { id: "4210", language: "klingon" });

    expect(result.isError).toBe(true);
    expect(errorTextOf(result)).toContain("invalid_input");
  });

  it("names the argument it refused", async () => {
    const result = await callOn(wholeSite(), "search_titles", { query: "harbour", sort: "year" });

    expect(errorTextOf(result)).toContain("sort");
  });

  it("carries no structured payload, since nothing was read", async () => {
    const result = (await callOn(wholeSite(), "search_titles", {
      query: "harbour",
      sort: "year",
    })) as {
      structuredContent?: unknown;
    };

    expect(result.structuredContent).toBeUndefined();
  });

  it("makes no request at all before refusing", async () => {
    const where = wholeSite();
    await callOn(where, "search_titles", { query: "harbour", media_type: "movie" });

    expect(where.calls.length).toBe(0);
  });
});

describe("a read that failed", () => {
  it("is a tool error rather than a raised exception, and carries no payload", async () => {
    const where = site([
      [
        /./,
        () => {
          throw new TypeError("the transport refused");
        },
      ],
    ]);

    const result = (await callOn(where, "search_titles", { query: "harbour" })) as {
      isError?: boolean;
      structuredContent?: unknown;
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it("says rate_limited rather than reporting nothing found", async () => {
    const where = site([
      [
        /./,
        (call) => {
          const response = new Response("slow down", {
            status: 429,
            headers: { "retry-after": "1" },
          });
          Object.defineProperty(response, "url", { value: call.url });
          return response;
        },
      ],
    ]);

    const result = await callOn(where, "search_titles", { query: "harbour" });

    expect(result.isError).toBe(true);
    expect(errorTextOf(result)).toContain("rate_limited");
  });
});

describe("every tool answered through the wiring", () => {
  const CALLS: [string, Record<string, unknown>][] = [
    ["search_titles", { query: "harbour" }],
    ["list_subtitles", { id: "4210", season: 3 }],
    ["list_subtitles", { id: "4210", season: 3, episode: 7 }],
    ["get_subtitle", { id: "880431" }],
    ["list_languages", {}],
  ];

  for (const [name, args] of CALLS) {
    it(`is accepted by the schema ${name} itself publishes, on ${JSON.stringify(args)}`, async () => {
      const result = await callOn(wholeSite(), name, args);

      expect(result.isError, `${name} was refused by its own schema`).not.toBe(true);
    });
  }

  it("answers a season the site does not hold as an error rather than an empty list", async () => {
    const where = site([[/./, (call) => html(fixture("season-past-last"), call.url)]]);

    const result = await callOn(where, "list_subtitles", { id: "4210", season: 9 });

    expect(result.isError).toBe(true);
  });
});

describe("the instructions", () => {
  it("name the tool a caller starts from and the one it calls before narrowing", () => {
    expect(INSTRUCTIONS).toContain("search_titles");
    expect(INSTRUCTIONS).toContain("list_languages");
  });

  it("say a rate_limited answer never means nothing matched", () => {
    expect(INSTRUCTIONS).toContain("rate_limited");
  });

  it("say no subtitle file is fetched and where a reader downloads one", () => {
    expect(INSTRUCTIONS).toMatch(/downloads no subtitle file|never fetches/i);
    expect(INSTRUCTIONS).toContain("page_url");
  });

  it("name the code that collides, so nobody reads 'br' as Breton", () => {
    expect(INSTRUCTIONS).toContain("Breton");
  });

  it("ask for the site to be credited", () => {
    expect(INSTRUCTIONS).toMatch(/credit/i);
  });
});
