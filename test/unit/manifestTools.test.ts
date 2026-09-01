/**
 * A host reads the extension manifest before installing anything, so a tool the
 * manifest does not know is announced to nobody. The packer also refuses any key
 * beyond a name and a description, and it refuses at tag time rather than at
 * review time.
 */

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../src/server.js";
import { wholeSite } from "./support.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../packaging/manifest.json", import.meta.url), "utf8"),
);

let announced: string[] = [];

beforeAll(async () => {
  const server = createServer({ fetchImpl: wholeSite().impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const host = new Client({ name: "manifest-test", version: "0.0.0" });
  await Promise.all([host.connect(clientTransport), server.connect(serverTransport)]);
  announced = (await host.listTools()).tools.map((tool) => tool.name);
});

describe("the manifest, against the server it describes", () => {
  it("names every tool the server registers, in the same order", () => {
    expect(manifest.tools.map((tool: { name: string }) => tool.name)).toEqual(announced);
  });

  it("carries of each tool only what the bundle format defines", () => {
    for (const tool of manifest.tools) {
      expect(Object.keys(tool).sort(), `tool ${tool.name}`).toEqual(["description", "name"]);
    }
  });

  it("gives each tool a description short enough to choose by", () => {
    for (const tool of manifest.tools) {
      expect(tool.description.length, `tool ${tool.name}`).toBeLessThanOrEqual(120);
    }
  });
});
