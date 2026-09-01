import { describe, expect, it } from "vitest";
import {
  captured,
  decodeEntities,
  indentMarkerLines,
  plainText,
  readInteger,
} from "../../src/tvsubtitles/text.js";

describe("decodeEntities", () => {
  it("reads the named entities the site writes its names with", () => {
    expect(decodeEntities("Salt &amp; Pepper")).toBe("Salt & Pepper");
    expect(decodeEntities("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeEntities("&lt;not a tag&gt;")).toBe("<not a tag>");
    expect(decodeEntities("&nbsp;").trim()).toBe("");
  });

  it("reads a numeric entity in either base", () => {
    expect(decodeEntities("&#39;")).toBe("'");
    expect(decodeEntities("&#x27;")).toBe("'");
    expect(decodeEntities("&#8212;")).toBe("—");
  });

  it("leaves an entity it does not know exactly as the site wrote it", () => {
    expect(decodeEntities("&nosuch;")).toBe("&nosuch;");
  });

  it("leaves text carrying no entity untouched", () => {
    expect(decodeEntities("Harbour Lights")).toBe("Harbour Lights");
    expect(decodeEntities("")).toBe("");
  });

  it("leaves an ampersand that opens no entity alone", () => {
    expect(decodeEntities("Salt & Pepper")).toBe("Salt & Pepper");
  });
});

describe("plainText", () => {
  it("gives back the words inside the markup and none of the tags", () => {
    expect(plainText("<b>Harbour Lights</b>")).toBe("Harbour Lights");
  });

  it("reads the entities the markup carried", () => {
    expect(plainText("<b>Salt &amp; Pepper</b>")).toBe("Salt & Pepper");
  });

  it("answers markup holding no words with nothing", () => {
    expect(plainText("<b></b>")).toBe("");
    expect(plainText("")).toBe("");
  });
});

describe("readInteger", () => {
  it("reads a plain number", () => {
    expect(readInteger("318")).toBe(318);
  });

  it("reads the site's own grouping, which separates thousands with spaces", () => {
    expect(readInteger("523 807 767")).toBe(523_807_767);
  });

  it("reads a zero the site printed as the figure it is", () => {
    expect(readInteger("0")).toBe(0);
  });

  it("answers nothing where the site printed nothing", () => {
    expect(readInteger("")).toBeNull();
    expect(readInteger("   ")).toBeNull();
  });

  it("answers nothing rather than a number read out of a word", () => {
    expect(readInteger("not a number")).toBeNull();
    expect(readInteger("n/a")).toBeNull();
  });
});

describe("indentMarkerLines", () => {
  it("moves a line opening on a word this server writes its own notes with", () => {
    const guarded = indentMarkerLines("Note: this file was checked by the site.");

    expect(guarded.startsWith("Note:")).toBe(false);
    expect(guarded).toContain("Note: this file was checked by the site.");
  });

  it("moves a source line the same way", () => {
    const guarded = indentMarkerLines("Source: the harbour office.");

    expect(guarded.startsWith("Source:")).toBe(false);
    expect(guarded).toContain("Source: the harbour office.");
  });

  it("moves such a line wherever it sits in a run of lines", () => {
    const guarded = indentMarkerLines("a first line\nNote: forged\na last line");
    const lines = guarded.split("\n");

    expect(lines[0]).toBe("a first line");
    expect(lines[1]?.startsWith("Note:")).toBe(false);
    expect(lines[2]).toBe("a last line");
  });

  it("leaves text carrying no such line exactly as published", () => {
    expect(indentMarkerLines("Synced against the broadcast cut.")).toBe(
      "Synced against the broadcast cut.",
    );
    expect(indentMarkerLines("")).toBe("");
  });

  it("leaves a line merely holding the word further along alone", () => {
    expect(indentMarkerLines("a note: not at the front")).toBe("a note: not at the front");
  });
});

describe("captured", () => {
  it("gives back what a pattern matched", () => {
    const match = /season (\d+)/.exec("season 3") as RegExpMatchArray;

    expect(captured(match, 1)).toBe("3");
  });

  /**
   * A group the page did not fill is a page in a shape this client cannot read,
   * which is a different answer from a field the site printed nothing in.
   */
  it("refuses a group the match never filled rather than reading nothing into it", () => {
    const match = /season (\d+)?/.exec("season ") as RegExpMatchArray;

    try {
      captured(match, 1);
      throw new Error("the empty group was accepted");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("parse_failure");
    }
  });
});
