import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  episodeLanguageUrl,
  episodeUrl,
  isFrontPage,
  searchUrl,
  seasonUrl,
  showIndexUrl,
  subtitleUrl,
} from "../../src/tvsubtitles/urls.js";

describe("the addresses this server builds", () => {
  it("all sit on the one site this server reads", () => {
    for (const url of [
      showIndexUrl(),
      seasonUrl(4210, 3),
      episodeUrl(52_118),
      episodeLanguageUrl(52_118, "fr"),
      subtitleUrl(880_431),
      searchUrl(),
    ]) {
      expect(url.startsWith(BASE_URL), `${url} leaves the site`).toBe(true);
      expect(url).not.toContain("../");
    }
  });

  it("name each page the way the site addresses it", () => {
    expect(showIndexUrl()).toBe(`${BASE_URL}/tvshows.html`);
    expect(seasonUrl(4210, 3)).toBe(`${BASE_URL}/tvshow-4210-3.html`);
    expect(episodeUrl(52_118)).toBe(`${BASE_URL}/episode-52118.html`);
    expect(episodeLanguageUrl(52_118, "fr")).toBe(`${BASE_URL}/episode-52118-fr.html`);
    expect(subtitleUrl(880_431)).toBe(`${BASE_URL}/subtitle-880431.html`);
    expect(searchUrl()).toBe(`${BASE_URL}/search1.php`);
  });

  it("ask the site for the newest season with the number it reserves for it", () => {
    expect(seasonUrl(4210, 0)).toBe(`${BASE_URL}/tvshow-4210-0.html`);
  });
});

describe("an identifier an address builder will not take", () => {
  const NOT_ONE = ["4210/../../etc", "harbour", "", "4210?x=1", "42 10"];

  for (const value of NOT_ONE) {
    it(`refuses ${JSON.stringify(value)} rather than putting it in a path`, () => {
      for (const build of [
        () => seasonUrl(value as unknown as number, 3),
        () => episodeUrl(value as unknown as number),
        () => episodeLanguageUrl(value as unknown as number, "fr"),
        () => subtitleUrl(value as unknown as number),
      ]) {
        try {
          const url = build();
          throw new Error(`the identifier was accepted and built ${url}`);
        } catch (error) {
          expect((error as { code?: string }).code).toBe("invalid_input");
        }
      }
    });
  }

  it("refuses a number that names no record", () => {
    for (const value of [4210.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        subtitleUrl(value);
        throw new Error(`${value} was accepted`);
      } catch (error) {
        expect((error as { code?: string }).code).toBe("invalid_input");
      }
    }
  });

  it("refuses a language code the site addresses nothing by", () => {
    for (const code of ["", "fr/../x", "FRANCAIS", "f"]) {
      try {
        const url = episodeLanguageUrl(52_118, code);
        expect(url.startsWith(BASE_URL), `${url} leaves the site`).toBe(true);
        expect(url).not.toContain("../");
      } catch (error) {
        expect((error as { code?: string }).code).toBe("invalid_input");
      }
    }
  });
});

describe("isFrontPage", () => {
  it("knows the address the site sends a reader to when it holds no such record", () => {
    expect(isFrontPage(BASE_URL)).toBe(true);
    expect(isFrontPage(`${BASE_URL}/index.html`)).toBe(true);
  });

  it("does not take a record's own page for the front page", () => {
    expect(isFrontPage(subtitleUrl(880_431))).toBe(false);
    expect(isFrontPage(showIndexUrl())).toBe(false);
  });
});
