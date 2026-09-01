/**
 * The README is the only thing read before installing this, and npm serves the
 * one frozen at publication. These tests hold it to the server it describes:
 * an argument table that drifts from the published schema, or a default that
 * drifts from config.ts, sends an installer to read the code.
 */

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { wholeSite } from "./support.js";

const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const config = readFileSync(new URL("../../src/config.ts", import.meta.url), "utf8");

const ENGLISH = [
  "## Install",
  "## What you can ask",
  "## Tools",
  "## Configuration",
  "## Errors",
  "## As a library",
  "## Pacing and attribution",
  "## Privacy",
  "## Development",
  "## Contributing",
  "## License",
];

const FRENCH = [
  "## Installation",
  "## Ce qu'on peut demander",
  "## Les outils",
  "## Configuration",
  "## Erreurs",
  "## Comme bibliothèque",
  "## Rythme et attribution",
  "## Confidentialité",
  "## Développement",
  "## Contribuer",
  "## Licence",
];

let tools: Array<{ name: string; inputSchema: { properties?: Record<string, unknown> } }> = [];

beforeAll(async () => {
  const server = createServer({ fetchImpl: wholeSite().impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: "readme-test", version: "0.0.0" });
  await Promise.all([host.connect(clientTransport), server.connect(serverTransport)]);
  tools = (await host.listTools()).tools as typeof tools;
});

/** Each half, split on the anchor that opens the French one. */
const halves = () => {
  const at = readme.indexOf('<a name="mcp-tvsubtitles-français">');
  expect(at, "the French half has no anchor to switch to").toBeGreaterThan(0);
  return { english: readme.slice(0, at), french: readme.slice(at) };
};

describe("the two halves", () => {
  it("carry the sections in order, each in its own language", () => {
    const { english, french } = halves();
    for (const [half, sections, named] of [
      [english, ENGLISH, "English"],
      [french, FRENCH, "French"],
    ] as const) {
      let last = -1;
      for (const section of sections) {
        const at = half.indexOf(`\n${section}\n`);
        expect(at, `${named} half is missing ${section}`).toBeGreaterThan(-1);
        expect(at, `${named} half has ${section} out of order`).toBeGreaterThan(last);
        last = at;
      }
    }
  });

  it("switch to one another through anchors that exist", () => {
    expect(readme).toContain("_[Version française](#mcp-tvsubtitles-français)_");
    expect(readme).toContain("_[English version](#mcp-tvsubtitles)_");
    expect(readme).toContain("# mcp-tvsubtitles (français)");
  });
});

describe("the tools, against what the server publishes", () => {
  it("give every registered tool a subsection in each half", () => {
    const { english, french } = halves();
    for (const tool of tools) {
      expect(english, `English half is missing ### \`${tool.name}\``).toContain(
        `### \`${tool.name}\``,
      );
      expect(french, `French half is missing ### \`${tool.name}\``).toContain(
        `### \`${tool.name}\``,
      );
    }
  });

  it("name no tool the server does not register", () => {
    const named = [...readme.matchAll(/^### `([a-z_]+)`$/gm)].map((match) => match[1]);
    for (const name of new Set(named)) {
      expect(
        tools.some((tool) => tool.name === name),
        `the README documents '${name}', which the server does not register`,
      ).toBe(true);
    }
  });

  it("name exactly the arguments each published schema declares", () => {
    for (const tool of tools) {
      const declared = Object.keys(tool.inputSchema.properties ?? {}).sort();
      // Bounded at the next heading: a subsection read to the end of the file
      // would take in every later table, and the assertion would then pass on
      // arguments documented for another tool.
      const opened = readme.split(`### \`${tool.name}\``)[1] ?? "";
      const section = opened.split(/\n#{2,3} /)[0] ?? "";
      const documented = [...section.matchAll(/^\| `([a-z_]+)`\s*\|/gm)].map((match) => match[1]);
      expect(
        [...new Set(documented)].sort(),
        `the argument table of ${tool.name} has drifted from its schema`,
      ).toEqual(declared);
    }
  });
});

describe("what an installer copies", () => {
  it("names the package this repository publishes", () => {
    expect(readme).toContain(`npx -y ${pkg.name}`);
    expect(readme).toContain(`"${pkg.name}"`);
  });

  it("tags the image with the version being published", () => {
    expect(readme).toContain(`ghcr.io/smeet666/${pkg.name}:${pkg.version}`);
  });

  it("documents every environment variable the server reads, with its default", () => {
    const read = [...config.matchAll(/env\.(TVS_[A-Z_]+)|"(TVS_[A-Z_]+)"/g)]
      .map((match) => match[1] ?? match[2])
      .filter((name): name is string => name !== undefined);
    for (const name of new Set(read)) {
      expect(readme, `the configuration table is missing ${name}`).toContain(`\`${name}\``);
    }
  });

  it("announces the interval floor config.ts actually keeps", () => {
    const floor = /MIN_ALLOWED_INTERVAL_MS = (\d+)/.exec(config)?.[1];
    expect(floor, "config.ts publishes no interval floor").toBeDefined();
    expect(readme, "the README announces a floor config.ts does not keep").toContain(
      `${floor} is a floor`,
    );
  });
});

describe("the turns of phrase this repository keeps out", () => {
  it("uses no em dash outside the attribution line", () => {
    expect(readme.includes("—"), "an em dash reached the README").toBe(false);
  });

  it("writes the affirmative sentence rather than an antithesis", () => {
    for (const shape of [
      /\bnot just\b/i,
      /\bisn't just\b/i,
      /\brather than a\b/i,
      /\bce n'est pas seulement\b/i,
      /\bnon pas\b/i,
    ]) {
      expect(shape.test(readme), `the README carries ${shape}`).toBe(false);
    }
  });

  it("addresses a person rather than a model", () => {
    for (const shape of [/\bthe model\b/i, /\byour LLM\b/i, /\bagentic\b/i, /\bAI assistant\b/i]) {
      expect(shape.test(readme), `the README carries ${shape}`).toBe(false);
    }
  });

  it("describes the current version without comparing it to a past one", () => {
    for (const shape of [
      /\bnow uses\b/i,
      /\bpreviously\b/i,
      /\bdésormais\b/i,
      /\bcomme avant\b/i,
    ]) {
      expect(shape.test(readme), `the README carries ${shape}`).toBe(false);
    }
  });
});
