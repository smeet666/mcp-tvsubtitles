import { describe, expect, it } from "vitest";
import {
  TvSubtitlesError,
  invalidInput,
  networkError,
  notFound,
  parseFailure,
  rateLimited,
  timeout,
} from "../../src/errors.js";

/** The list is closed. A seventh code is a vocabulary a caller cannot branch on. */
/** A stable order, so the comparison does not depend on a default. */
const compare = (left: string, right: string): number => left.localeCompare(right);

const CODES = [
  "not_found",
  "invalid_input",
  "rate_limited",
  "parse_failure",
  "network_error",
  "timeout",
] as const;

describe("the error vocabulary", () => {
  it("holds six codes and no others", () => {
    const built = [
      notFound("gone"),
      invalidInput("refused"),
      rateLimited("slow down"),
      parseFailure("unreadable"),
      networkError("no answer"),
      timeout("too long"),
    ];

    expect(built.map((error) => error.code).sort(compare)).toEqual([...CODES].sort(compare));
  });

  it("gives every error a message a person can read", () => {
    for (const error of [notFound("gone"), invalidInput("refused"), timeout("too long")]) {
      expect(error).toBeInstanceOf(TvSubtitlesError);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it("carries the details a caller was handed rather than inventing any", () => {
    const error = notFound("no such show", {
      url: "https://www.tvsubtitles.net/tvshow-4210-1.html",
    });

    expect(error.details).toMatchObject({ url: "https://www.tvsubtitles.net/tvshow-4210-1.html" });
  });

  it("invents no detail the caller did not pass", () => {
    expect(Object.keys(notFound("no such show").details ?? {})).toEqual([]);
  });

  it("separates rate limiting from absence, so slowing down never reads as nothing found", () => {
    expect(rateLimited("slow down").code).not.toBe(notFound("gone").code);
  });
});

describe("every code, built with and without details", () => {
  const BUILDERS = [
    ["not_found", notFound],
    ["rate_limited", rateLimited],
    ["parse_failure", parseFailure],
    ["network_error", networkError],
    ["timeout", timeout],
  ] as const;

  for (const [code, build] of BUILDERS) {
    it(`gives ${code} its code whether or not a detail came with it`, () => {
      const bare = build("something happened");
      const detailed = build("something happened", {
        hint: "Call search_titles to find the id.",
      } as never);

      expect(bare.code).toBe(code);
      expect(detailed.code).toBe(code);
      expect(detailed.details).toMatchObject({ hint: "Call search_titles to find the id." });
    });

    it(`makes ${code} an Error a caller can catch and read`, () => {
      const error = build("something happened");

      expect(error).toBeInstanceOf(Error);
      expect(error.name.length).toBeGreaterThan(0);
      expect(String(error)).toContain("something happened");
    });
  }

  it("gives invalid_input its code and its hint, which it takes as the wording itself", () => {
    const bare = invalidInput("that argument is not one this tool takes");
    const hinted = invalidInput("that argument is not one this tool takes", "Pass 'tv' instead.");

    expect(bare.code).toBe("invalid_input");
    expect(hinted.code).toBe("invalid_input");
    expect(hinted.details).toMatchObject({ hint: "Pass 'tv' instead." });
    expect(String(hinted)).toContain("that argument is not one this tool takes");
  });

  it("carries a hint where one names the next move, and none where it does not", () => {
    const withHint = new TvSubtitlesError("not_found", "no such show", {
      hint: "Call search_titles to find the id.",
    });

    expect(withHint.details).toMatchObject({ hint: "Call search_titles to find the id." });
    expect(notFound("no such show").details?.hint).toBeUndefined();
  });
});
