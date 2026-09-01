import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION,
  MAX_TEXT_CHARS,
  SOURCE_NAME,
  READS_CATALOGUE_ONLY,
  toToolError,
  truncate,
} from "../../src/tools/shared.js";
import {
  invalidInput,
  networkError,
  notFound,
  parseFailure,
  rateLimited,
  timeout,
} from "../../src/errors.js";

describe("truncate", () => {
  it("leaves a text shorter than the bound it was given exactly as published", () => {
    expect(truncate("Synced against the broadcast cut.", MAX_TEXT_CHARS)).toBe(
      "Synced against the broadcast cut.",
    );
    expect(truncate("", MAX_TEXT_CHARS)).toBe("");
  });

  it("leaves a text of exactly the bound whole", () => {
    const exact = "a".repeat(MAX_TEXT_CHARS);

    expect(truncate(exact, MAX_TEXT_CHARS)).toBe(exact);
  });

  it("cuts a text past the bound", () => {
    const long = "a".repeat(MAX_TEXT_CHARS * 3);
    const cut = truncate(long, MAX_TEXT_CHARS);

    expect(cut.length).toBeLessThanOrEqual(MAX_TEXT_CHARS + 1);
    expect(cut.startsWith("a")).toBe(true);
  });

  it("marks the cut, so a reader is never handed a shortened text as a whole one", () => {
    const cut = truncate("b".repeat(50), 10);

    expect(cut.replace(/b/g, "").length, "nothing marks the cut").toBeGreaterThan(0);
  });

  it("bounds a text this server prints far below what a page can hold", () => {
    expect(MAX_TEXT_CHARS).toBeGreaterThan(0);
  });
});

describe("what every answer names", () => {
  it("names the site it read", () => {
    expect(SOURCE_NAME).toBe("tvsubtitles.net");
  });

  it("carries an attribution a client can show beside a result", () => {
    expect(ATTRIBUTION).toContain("tvsubtitles.net");
  });

  it("says this server reads the catalogue and fetches no file", () => {
    expect(READS_CATALOGUE_ONLY.toLowerCase()).toMatch(/catalogue|catalog/);
    expect(READS_CATALOGUE_ONLY).toContain("page_url");
  });
});

describe("toToolError", () => {
  const CODES = [
    ["not_found", notFound("no such show")],
    ["invalid_input", invalidInput("that is not an argument")],
    ["rate_limited", rateLimited("slow down")],
    ["parse_failure", parseFailure("unreadable")],
    ["network_error", networkError("no answer")],
    ["timeout", timeout("too long")],
  ] as const;

  for (const [code, error] of CODES) {
    it(`opens the text it renders with ${code}, and marks the answer a failure`, () => {
      const rendered = toToolError(error);

      expect(rendered.isError).toBe(true);
      expect(rendered.content.map((block) => block.text).join("\n")).toContain(`[${code}]`);
      expect((rendered as { structuredContent?: unknown }).structuredContent).toBeUndefined();
    });
  }

  const SIX = /\[(not_found|invalid_input|rate_limited|parse_failure|network_error|timeout)\]/;

  function textOfError(value: unknown): string {
    return toToolError(value)
      .content.map((block) => block.text)
      .join("\n");
  }

  it("carries the hint where the error names the next move", () => {
    expect(textOfError(notFound("no such show", { hint: "Call search_titles first." }))).toContain(
      "Call search_titles first.",
    );
  });

  it("gives a failure that carries no code one of the six all the same", () => {
    expect(textOfError(new Error("something else went wrong"))).toMatch(SIX);
  });

  it("gives a thrown value that is not an error one of the six as well", () => {
    expect(textOfError("a string nobody expected")).toMatch(SIX);
    expect(textOfError(undefined)).toMatch(SIX);
    expect(textOfError({ nothing: "useful" })).toMatch(SIX);
  });
});
