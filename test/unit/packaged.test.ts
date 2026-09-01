/**
 * What npm serves, against what package.json promises.
 *
 * The declaration and the build are written apart, so an entry point renamed in
 * one and not the other installs a package whose import fails. This reads the
 * built tree, which `pretest` produces.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const at = (path: string) => new URL(`../../${path}`, import.meta.url);

describe("the built package", () => {
  it("serves every path the exports map declares", () => {
    for (const [subpath, entry] of Object.entries(pkg.exports) as [
      string,
      { import: string; types: string },
    ][]) {
      for (const declared of [entry.import, entry.types]) {
        expect(
          existsSync(at(declared)),
          `${subpath} declares ${declared}, which was not built`,
        ).toBe(true);
      }
    }
  });

  it("serves the executable the bin entry names", () => {
    for (const [name, path] of Object.entries(pkg.bin) as [string, string][]) {
      expect(existsSync(at(path)), `bin ${name} names ${path}, which was not built`).toBe(true);
    }
  });

  it("opens the executable with the line that lets a host run it", () => {
    const executable = readFileSync(at(pkg.bin[pkg.name]), "utf8");
    expect(executable.startsWith("#!"), "the executable carries no shebang").toBe(true);
  });

  it("keeps the client layer free of the protocol it is published without", () => {
    const client = readFileSync(at(pkg.exports["./client"].import), "utf8");
    expect(
      client.includes("@modelcontextprotocol/sdk"),
      "the client subpath pulls in the MCP SDK, so it is not the plain library it is published as",
    ).toBe(false);
  });
});
