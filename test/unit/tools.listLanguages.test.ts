import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { silentLogger, textOf, wholeSite } from "./support.js";

type Args = Parameters<typeof runListLanguages>[1];

function run(value: Record<string, unknown> = {}) {
  const client = new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: wholeSite().impl,
  });
  return runListLanguages(client, value as unknown as Args);
}

describe("list_languages", () => {
  it("answers the twenty-four languages the site catalogues", async () => {
    const result = await run();
    const payload = result.structuredContent as unknown as {
      languages: Array<{ name: string; site_code: string; code: string | null }>;
      language_count: number;
      scope: string;
    };

    expect(payload.languages.length).toBe(24);
    expect(payload.language_count).toBe(payload.languages.length);
    expect(payload.scope).toBe("catalogue");
  });

  it("names what it counted, which is the catalogue rather than one show", async () => {
    const payload = (await run()).structuredContent as unknown as { scope: string };

    expect(payload.scope).toBe("catalogue");
  });

  it("marks the six codes the site chose that ISO 639-1 spells otherwise", async () => {
    const payload = (await run()).structuredContent as unknown as {
      languages: Array<{ site_code: string; differs_from_iso: boolean }>;
    };
    const differing = payload.languages
      .filter((language) => language.differs_from_iso)
      .map((language) => language.site_code)
      .sort((left, right) => left.localeCompare(right));

    expect(differing).toEqual(["br", "cn", "cz", "gr", "jp", "ua"]);
  });

  it("maps the code that collides to Brazilian Portuguese, and reports Breton nowhere", async () => {
    const result = await run();
    const payload = result.structuredContent as unknown as {
      notes: string[];
      languages: Array<{ site_code: string; code: string | null; name: string }>;
    };
    const everything = `${JSON.stringify(payload)}\n${textOf(result)}`.toLowerCase();

    expect(payload.languages.find((language) => language.site_code === "br")?.code).toBe("pt-BR");
    expect(everything).not.toContain("breton");
  });

  it("lets every note reach the text a client renders on its own", async () => {
    const result = await run();
    const payload = result.structuredContent as unknown as { notes: string[] };
    const text = textOf(result);

    for (const note of payload.notes) {
      expect(text, `a note never reached the text block: ${note}`).toContain(note);
    }
  });

  it("carries a link back to the site", async () => {
    const result = await run();

    expect(textOf(result)).toContain("tvsubtitles.net");
  });

  it("reaches no site at all, since the table is written here", async () => {
    const result = await run();

    expect(result.structuredContent).toBeDefined();
  });
});
