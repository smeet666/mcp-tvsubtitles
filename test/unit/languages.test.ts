import { describe, expect, it } from "vitest";
import { requireLanguage } from "../../src/tvsubtitles/client.js";
import {
  LANGUAGES,
  languageBySiteCode,
  languageNames,
  resolveLanguage,
} from "../../src/tvsubtitles/languages.js";

/** The six codes the site chose that are not the ISO 639-1 ones. */
const DIFFERING: [string, string][] = [
  ["gr", "el"],
  ["cz", "cs"],
  ["jp", "ja"],
  ["cn", "zh"],
  ["ua", "uk"],
  ["br", "pt-BR"],
];

describe("the table this server writes by hand", () => {
  it("holds the twenty-four languages the site draws a flag for", () => {
    expect(LANGUAGES.length).toBe(24);
  });

  it("addresses each language by a code of the site's own", () => {
    const codes = LANGUAGES.map((language) => language.siteCode);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        "en",
        "es",
        "fr",
        "de",
        "br",
        "ru",
        "ua",
        "it",
        "gr",
        "ar",
        "hu",
        "pl",
        "tr",
        "nl",
        "pt",
        "sv",
        "da",
        "fi",
        "ko",
        "cn",
        "jp",
        "bg",
        "cz",
        "ro",
      ]),
    );
  });

  it("gives the six codes that differ from ISO 639-1 the tag they really mean", () => {
    for (const [siteCode, expected] of DIFFERING) {
      expect(languageBySiteCode(siteCode)?.code, `the site's '${siteCode}'`).toBe(expected);
    }
  });

  it("codes a language only where the mapping is certain, and never guesses one", () => {
    for (const language of LANGUAGES) {
      expect(
        language.code === null || typeof language.code === "string",
        `${language.siteCode} carries neither a tag nor null`,
      ).toBe(true);
    }
  });
});

describe("the code the site writes 'br'", () => {
  it("is Brazilian Portuguese and is never reported as Breton", () => {
    const language = languageBySiteCode("br");

    expect(language?.code).toBe("pt-BR");
    expect(language?.code).not.toBe("br");
    expect(language?.name.toLowerCase()).not.toContain("breton");
  });

  it("leaves the whole table free of Breton, whichever way it is asked for", () => {
    const named = LANGUAGES.map((language) => language.name.toLowerCase()).join(" ");

    expect(named).not.toContain("breton");
    expect(resolveLanguage("breton") ?? null).toBeNull();
    expect(resolveLanguage("Breton") ?? null).toBeNull();
  });

  it("keeps the site's own wording in the name rather than translating it", () => {
    expect(languageBySiteCode("br")?.name).toBe("portuguese(br)");
  });
});

describe("resolveLanguage", () => {
  it("takes the name the site prints", () => {
    expect(resolveLanguage("french")?.siteCode).toBe("fr");
  });

  it("takes the site's own two-letter code", () => {
    expect(resolveLanguage("cz")?.siteCode).toBe("cz");
  });

  it("takes the BCP 47 tag, including the one that is not two letters", () => {
    expect(resolveLanguage("pt-BR")?.siteCode).toBe("br");
    expect(resolveLanguage("cs")?.siteCode).toBe("cz");
  });

  it("ignores the case a caller typed", () => {
    expect(resolveLanguage("FRENCH")?.siteCode).toBe("fr");
    expect(resolveLanguage("PT-br")?.siteCode).toBe("br");
  });

  it("answers a language the site does not hold with nothing rather than a near miss", () => {
    for (const asked of ["klingon", "frenchh", ""]) {
      expect(resolveLanguage(asked) ?? null, `${JSON.stringify(asked)} matched`).toBeNull();
    }
  });
});

describe("requireLanguage", () => {
  it("hands back the language when the site holds it", () => {
    expect(requireLanguage("french").siteCode).toBe("fr");
  });

  it("refuses one the site does not hold as invalid_input, naming what was asked", () => {
    try {
      requireLanguage("klingon");
      throw new Error("the language was accepted");
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      expect(failure.code).toBe("invalid_input");
      expect(failure.message).toContain("klingon");
    }
  });

  it("refuses rather than answering an absence, which the site cannot establish", () => {
    try {
      requireLanguage("breton");
      throw new Error("Breton was accepted");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("invalid_input");
    }
  });
});

describe("languageNames", () => {
  it("lists the name of every language the site draws a flag for", () => {
    const names = languageNames();

    expect(names.length).toBe(LANGUAGES.length);
    expect(names).toContain("portuguese(br)");
    expect(names).not.toContain("breton");
  });
});
