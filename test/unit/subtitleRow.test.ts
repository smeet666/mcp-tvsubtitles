import { describe, expect, it } from "vitest";
import { toIsoTimestamp, toSubtitleRow } from "../../src/tools/subtitleRow.js";

/** The record shape the site layer reads off a subtitle page. */
type Record_ = Parameters<typeof toSubtitleRow>[0];
type Context = Parameters<typeof toSubtitleRow>[1];

const context = { showId: "4210" } as unknown as Context;

function record(overrides: Partial<Record<string, unknown>> = {}): Record_ {
  return {
    id: "880431",
    showName: "Harbour Lights",
    season: 3,
    episode: 7,
    episodeTitle: "The Long Way Round",
    rip: "HDTV",
    release: "LOL",
    comment: null,
    uploader: "rivermouth",
    fileName: "Harbour Lights - 3x07 - The Long Way Round.HDTV.LOL.en.srt",
    sizeText: "21.4 kb",
    uploadedText: "04.02.14 09:12:30",
    downloads: 318,
    ratedGood: 2,
    ratedBad: 0,
    siteCode: "en",
    ...overrides,
  } as unknown as Record_;
}

describe("release_match", () => {
  it("says 'stated' where the site published a medium and a group", () => {
    const row = toSubtitleRow(record(), context);

    expect(row.release_match).toBe("stated");
    expect(row.releases).toEqual(["HDTV", "LOL"]);
  });

  it("says 'stated' where the site published one of the two", () => {
    expect(toSubtitleRow(record({ release: null }), context).release_match).toBe("stated");
    expect(toSubtitleRow(record({ rip: null }), context).release_match).toBe("stated");
  });

  it("says 'none' where the site published neither, and carries no release at all", () => {
    const row = toSubtitleRow(record({ rip: null, release: null }), context);

    expect(row.release_match).toBe("none");
    expect(row.releases).toEqual([]);
  });

  it("never says 'inferred', since nothing here is read off a file name", () => {
    const row = toSubtitleRow(
      record({ rip: null, release: null, fileName: "Harbour.Lights.S03E07.HDTV.LOL.srt" }),
      context,
    );

    expect(row.release_match).toBe("none");
    expect(row.releases).toEqual([]);
  });
});

describe("a release name", () => {
  it("keeps the case the uploader typed, which is the token a caller matches on", () => {
    expect(toSubtitleRow(record({ release: "LOL" }), context).releases).toContain("LOL");
    expect(toSubtitleRow(record({ release: "lol" }), context).releases).toContain("lol");
    expect(toSubtitleRow(record({ release: "lol" }), context).releases).not.toContain("LOL");
  });

  it("is carried as published rather than rewritten", () => {
    const row = toSubtitleRow(record({ rip: "WEB", release: "NF" }), context);

    expect(row.releases).toEqual(["WEB", "NF"]);
  });
});

describe("language_code", () => {
  it("is filled where the site's own code maps to a tag with certainty", () => {
    expect(toSubtitleRow(record({ siteCode: "fr" }), context).language_code).toBe("fr");
    expect(toSubtitleRow(record({ siteCode: "gr" }), context).language_code).toBe("el");
  });

  it("reports the site's 'br' as Brazilian Portuguese and never as Breton", () => {
    const row = toSubtitleRow(record({ siteCode: "br" }), context);

    expect(row.language).toBe("portuguese(br)");
    expect(row.language_code).toBe("pt-BR");
    expect(row.language_code).not.toBe("br");
  });

  it("is null for a code the table does not hold, rather than the code itself", () => {
    const row = toSubtitleRow(record({ siteCode: "zz" }), context);

    expect(row.language_code).toBeNull();
  });
});

describe("what this site does not publish", () => {
  it("leaves hearing_impaired and machine_translated null rather than inferring either", () => {
    const row = toSubtitleRow(record({ comment: "HI version, sdh" }), context);

    expect(row.hearing_impaired).toBeNull();
    expect(row.machine_translated).toBeNull();
  });

  it("states no pack, because every record here counts one episode", () => {
    const row = toSubtitleRow(record(), context);

    expect(row.is_pack).toBe(false);
    expect(row.files_in_pack).toBeNull();
  });
});

describe("a count the site printed nothing for", () => {
  it("is null rather than zero", () => {
    const row = toSubtitleRow(record({ downloads: null }), context);

    expect(row.downloads).toBeNull();
  });

  it("keeps a zero the site did print, which is a figure rather than an absence", () => {
    const row = toSubtitleRow(record({ downloads: 0, ratedGood: 0, ratedBad: 0 }), context);

    expect(row.downloads).toBe(0);
    expect(row.rating).toEqual({ good: 0, bad: 0 });
  });

  it("leaves an uploader the site named nobody for null", () => {
    expect(toSubtitleRow(record({ uploader: null }), context).uploader).toBeNull();
  });
});

describe("when a record was published", () => {
  it("carries the stamp twice, once read and once in the site's own wording", () => {
    const row = toSubtitleRow(record(), context);

    expect(row.published_text).toBe("04.02.14 09:12:30");
    expect(row.published_at).toBe("2014-02-04T09:12:30");
  });

  it("states no timezone, because the site states none", () => {
    const row = toSubtitleRow(record(), context);

    expect(row.published_at).not.toMatch(/Z$|[+-]\d{2}:\d{2}$/);
  });

  it("leaves the reading null on a stamp in no shape the site's format describes", () => {
    const row = toSubtitleRow(record({ uploadedText: "yesterday evening" }), context);

    expect(row.published_at).toBeNull();
    expect(row.published_text).toBe("yesterday evening");
  });

  it("leaves the reading null on a stamp naming a day its month does not hold", () => {
    const row = toSubtitleRow(record({ uploadedText: "31.02.14 10:00:00" }), context);

    expect(row.published_at).toBeNull();
    expect(row.published_text).toBe("31.02.14 10:00:00");
  });
});

describe("toIsoTimestamp", () => {
  it("reads the site's own two-digit-year stamp", () => {
    expect(toIsoTimestamp("04.02.14 09:12:30")).toBe("2014-02-04T09:12:30");
  });

  it("reads the day before the month, as the site writes it", () => {
    expect(toIsoTimestamp("11.03.14 07:04:09")).toBe("2014-03-11T07:04:09");
  });

  it("refuses a day the month does not hold rather than rolling into the next one", () => {
    expect(toIsoTimestamp("31.02.14 10:00:00")).toBeNull();
    expect(toIsoTimestamp("31.04.14 10:00:00")).toBeNull();
  });

  /**
   * An hour of 24 is a stamp the site never printed. Reading it as midnight of
   * the day after states a day the record does not carry.
   */
  it("refuses an hour outside its range rather than rolling into the next day", () => {
    expect(toIsoTimestamp("04.02.14 24:00:00")).toBeNull();
  });

  it("refuses a minute outside its range", () => {
    expect(toIsoTimestamp("04.02.14 09:60:00")).toBeNull();
  });

  it("refuses a second outside its range", () => {
    expect(toIsoTimestamp("04.02.14 09:12:60")).toBeNull();
  });

  it("answers anything else with nothing rather than a reading nobody can check", () => {
    for (const text of ["", "yesterday", "2014-02-04", "04/02/14 09:12:30", "04.02.14"]) {
      expect(toIsoTimestamp(text), `read something out of ${JSON.stringify(text)}`).toBeNull();
    }
  });
});

describe("what every row carries back to the site", () => {
  it("links to the page a reader downloads the file from", () => {
    const row = toSubtitleRow(record(), context);

    expect(row.page_url).toBe("https://www.tvsubtitles.net/subtitle-880431.html");
  });

  it("names the show it belongs to by the id the other tools take", () => {
    expect(toSubtitleRow(record(), context).title_id).toBe("4210");
  });

  it("names the site it was read from", () => {
    expect(toSubtitleRow(record(), context).source).toBe("tvsubtitles.net");
  });

  it("carries no subtitle text of any kind", () => {
    const row = toSubtitleRow(record(), context) as unknown as Record<string, unknown>;

    for (const forbidden of ["text", "content", "lines", "body", "subtitle", "download_url"]) {
      expect(Object.keys(row), `a row carries '${forbidden}'`).not.toContain(forbidden);
    }
  });
});

describe("a record the site printed only half of", () => {
  it("carries the medium alone where only the medium was published", () => {
    const row = toSubtitleRow(record({ release: null }), context);

    expect(row.releases).toEqual(["HDTV"]);
  });

  it("carries the group alone where only the group was published", () => {
    const row = toSubtitleRow(record({ rip: null }), context);

    expect(row.releases).toEqual(["LOL"]);
  });

  it("leaves the season and the episode null where the record names neither", () => {
    const row = toSubtitleRow(record({ season: null, episode: null }), context);

    expect(row.season).toBeNull();
    expect(row.episode).toBeNull();
  });

  it("leaves a counter the site printed nothing for null on both sides of the rating", () => {
    const row = toSubtitleRow(record({ ratedGood: null, ratedBad: null }), context);

    expect(row.rating).toEqual({ good: null, bad: null });
  });

  it("leaves the language null where the record names none", () => {
    const row = toSubtitleRow(record({ siteCode: null }), context);

    expect(row.language).toBeNull();
    expect(row.language_code).toBeNull();
  });

  it("leaves the file name, the size and the comment null where the site printed none", () => {
    const row = toSubtitleRow(record({ fileName: null, sizeText: null, comment: null }), context);

    expect(row.file_name).toBeNull();
    expect(row.size_text).toBeNull();
    expect(row.comment).toBeNull();
  });

  it("leaves the stamp null on both sides where the site printed none", () => {
    const row = toSubtitleRow(record({ uploadedText: null }), context);

    expect(row.published_text).toBeNull();
    expect(row.published_at).toBeNull();
  });
});
