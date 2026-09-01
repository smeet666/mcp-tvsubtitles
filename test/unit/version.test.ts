/**
 * The version, the author and the bundle address live in four files that were
 * written apart. Each test states the agreement rather than the value, so it
 * survives the day the value changes and fails the day one file is left behind.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PKG_VERSION, REPO_URL } from "../../src/version.js";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pkg = read("../../package.json");
const registry = read("../../server.json");
const manifest = read("../../packaging/manifest.json");

describe("the version, in every file that publishes it", () => {
  it("is the one the server reports", () => {
    expect(PKG_VERSION).toBe(pkg.version);
  });

  it("is the one the registry descriptor declares, for the entry and each package", () => {
    expect(registry.version).toBe(pkg.version);
    for (const published of registry.packages) {
      expect(published.version, `package ${published.registryType}`).toBe(pkg.version);
    }
  });

  it("is the one the extension manifest announces", () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it("is carried by the bundle address the registry serves", () => {
    const bundle = registry.packages.find(
      (published: { registryType: string }) => published.registryType === "mcpb",
    );
    expect(
      bundle,
      "the descriptor declares no mcpb package, so the tag builds a file nobody serves",
    ).toBeDefined();
    expect(bundle.identifier).toContain(`/v${pkg.version}/`);
    expect(bundle.identifier).toContain(`-${pkg.version}.mcpb`);
  });
});

describe("what several files name the same way", () => {
  it("credits one author", () => {
    expect(manifest.author.name).toBe(pkg.author.name);
    expect(readFileSync(new URL("../../LICENSE", import.meta.url), "utf8")).toContain(
      pkg.author.name,
    );
  });

  it("names one npm package", () => {
    const npm = registry.packages.find(
      (published: { registryType: string }) => published.registryType === "npm",
    );
    expect(npm.identifier).toBe(pkg.name);
    expect(manifest.name).toBe(pkg.name);
  });

  it("points at one repository", () => {
    expect(REPO_URL).toBe(registry.repository.url);
    expect(manifest.repository.url).toBe(`${REPO_URL}.git`);
  });

  it("declares the manifest revision this format is read at", () => {
    expect(manifest.manifest_version).toBe("0.3");
  });

  it("keeps the registry description inside what the registry accepts", () => {
    expect(registry.description.length).toBeLessThanOrEqual(100);
  });
});

describe("the shape of what npm publishes", () => {
  it("declares one entry point, its types, and the client subpath", () => {
    expect(pkg.exports["."].import).toBe("./dist/index.js");
    expect(pkg.exports["."].types).toBe("./dist/index.d.ts");
    expect(pkg.exports["./client"].import).toBe("./dist/tvsubtitles/client.js");
    expect(pkg.exports["./client"].types).toBe("./dist/tvsubtitles/client.d.ts");
  });

  it("carries the documents a reader gets from npm rather than from the repository", () => {
    for (const carried of ["dist", "README.md", "LICENSE", "CHANGELOG.md", "PRIVACY.md"]) {
      expect(pkg.files, `files is missing ${carried}`).toContain(carried);
    }
  });

  it("declares the floor of Node it is run on in one place", () => {
    expect(pkg.engines.node).toBe(manifest.compatibility.runtimes.node);
  });
});
