import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import {
  NOW,
  type Site,
  fails,
  fixture,
  html,
  settle,
  silentLogger,
  site,
  succeeds,
  textOf,
} from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function onePage(name: string, servedFrom: string): Site {
  return site([[/./, () => html(fixture(name), servedFrom)]]);
}

function clientOn(where: Site): TvSubtitlesClient {
  return new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: where.impl,
  });
}

const BASE = "https://www.tvsubtitles.net";

describe("an index row the site did not write as a show", () => {
  it("keeps the rows that are shows and leaves out the ones that are not", async () => {
    const read = await succeeds(
      clientOn(onePage("shows-index-odd", `${BASE}/tvshows.html`)).listShows(),
    );
    const names = read.data.shows.map((show) => show.name);

    expect(names).toContain("Harbour Lights");
    expect(names).not.toContain("Copper Kettle Lane");
    expect(names).not.toContain("The Ninth Wave");
  });

  /**
   * A caller that reads 'skipped' has to be able to say the catalogue came back
   * short. A row left out without being counted makes the answer look whole.
   */
  it("counts the rows it left out", async () => {
    const read = await succeeds(
      clientOn(onePage("shows-index-odd", `${BASE}/tvshows.html`)).listShows(),
    );

    expect(read.skipped ?? 0).toBeGreaterThan(0);
  });

  it("reads a numeric entity and leaves an entity it does not know as written", async () => {
    const read = await succeeds(
      clientOn(onePage("shows-index-odd", `${BASE}/tvshows.html`)).listShows(),
    );
    const odd = read.data.shows.find((show) => show.name.startsWith("Saltmarsh"));

    expect(odd?.name).toContain("'91");
    expect(odd?.name).toContain("—");
    expect(odd?.name).toContain("&nosuch;");
  });

  it("leaves a count the site wrote a word in null rather than reading a number out of it", async () => {
    const read = await succeeds(
      clientOn(onePage("shows-index-odd", `${BASE}/tvshows.html`)).listShows(),
    );
    const odd = read.data.shows.find((show) => show.name.startsWith("Saltmarsh"));

    expect(odd?.episodes).toBeNull();
    expect(odd?.subtitles).toBeNull();
  });

  it("keeps a year the site wrote a word in exactly as published", async () => {
    const read = await succeeds(
      clientOn(onePage("shows-index-odd", `${BASE}/tvshows.html`)).listShows(),
    );
    const odd = read.data.shows.find((show) => show.name.startsWith("Saltmarsh"));

    expect(odd?.year).toBe("unknown");
  });
});

describe("a footer naming only some of its counters", () => {
  it("leaves the ones it did not print unknown rather than counting them as none", async () => {
    const read = await succeeds(
      clientOn(onePage("shows-index-partial-footer", `${BASE}/tvshows.html`)).listShows(),
    );
    const totals = read.data.totals as unknown as Record<string, number | null> | null;

    expect(totals?.shows).toBe(2818);
    for (const [name, value] of Object.entries(totals ?? {})) {
      expect(value, `${name} was counted as none`).not.toBe(0);
    }
  });
});

describe("a season row the site did not write as an episode", () => {
  it("leaves out a row whose code names no episode", async () => {
    const read = await succeeds(
      clientOn(onePage("season-odd", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );

    expect(read.data.episodes.map((episode) => episode.episode)).toEqual([11]);
  });

  it("counts the row it left out", async () => {
    const read = await succeeds(
      clientOn(onePage("season-odd", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );

    expect(read.skipped ?? 0).toBeGreaterThan(0);
  });

  it("leaves an amount the site wrote a word in null rather than reading a number out of it", async () => {
    const read = await succeeds(
      clientOn(onePage("season-odd", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );

    expect(read.data.episodes[0]?.amount).toBeNull();
  });

  it("leaves out a flag for a code no language of this site answers to", async () => {
    const read = await succeeds(
      clientOn(onePage("season-odd", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );
    const codes = (read.data.episodes[0]?.languages ?? []).map((entry) => entry.siteCode);

    expect(codes).not.toContain("zz");
  });

  it("leaves out a flag whose link points at neither a record nor an episode", async () => {
    const read = await succeeds(
      clientOn(onePage("season-odd", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );
    const codes = (read.data.episodes[0]?.languages ?? []).map((entry) => entry.siteCode);

    expect(codes).not.toContain("fr");
  });
});

describe("a season page carrying no list of seasons", () => {
  it("reads its episodes and says it saw no other season rather than inventing one", async () => {
    const read = await succeeds(
      clientOn(onePage("season-no-list", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );

    expect(read.data.episodes.length).toBe(1);
    expect(read.data.seasonsAvailable).toEqual([]);
  });
});

describe("an episode block the site wrote short", () => {
  it("leaves every cell it printed nothing in null rather than reading a value into it", async () => {
    const read = await succeeds(
      clientOn(onePage("episode-odd", `${BASE}/episode-52118.html`)).listEpisodeSubtitles(
        52_118,
        undefined,
      ),
    );
    const first = read.data[0];

    expect(first?.rip).toBeNull();
    expect(first?.release).toBeNull();
    expect(first?.uploader).toBeNull();
    expect(first?.uploadedText).toBeNull();
    expect(first?.downloads).toBeNull();
  });

  it("leaves the two counters unknown where the site drew neither", async () => {
    const read = await succeeds(
      clientOn(onePage("episode-odd", `${BASE}/episode-52118.html`)).listEpisodeSubtitles(
        52_118,
        undefined,
      ),
    );

    expect(read.data[0]?.ratedGood).toBeNull();
    expect(read.data[0]?.ratedBad).toBeNull();
  });

  it("leaves out a block whose link carries no record id", async () => {
    const read = await succeeds(
      clientOn(onePage("episode-odd", `${BASE}/episode-52118.html`)).listEpisodeSubtitles(
        52_118,
        undefined,
      ),
    );

    expect(read.data.length).toBe(1);
  });

  it("counts the blocks it left out", async () => {
    const read = await succeeds(
      clientOn(onePage("episode-odd", `${BASE}/episode-52118.html`)).listEpisodeSubtitles(
        52_118,
        undefined,
      ),
    );

    expect(read.skipped ?? 0).toBeGreaterThan(0);
  });
});

describe("a record whose labels the site wrote in another order", () => {
  async function read(name: string, id: string) {
    const client = clientOn(onePage(name, `${BASE}/subtitle-${id}.html`));
    const outcome = await settle(
      runGetSubtitle(client, { id } as unknown as Parameters<typeof runGetSubtitle>[1]),
    );
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.value;
  }

  it("reads each label wherever it sat", async () => {
    const payload = (await read("subtitle-odd", "880470")).structuredContent as unknown as {
      subtitle: Record<string, unknown>;
    };

    expect(payload.subtitle.episode_title).toBe("The Long Way Round");
    expect(payload.subtitle.file_name).toBe("Harbour Lights - 3x07.srt");
  });

  it("leaves a label the site wrote empty null rather than blank", async () => {
    const payload = (await read("subtitle-odd", "880470")).structuredContent as unknown as {
      subtitle: Record<string, unknown>;
    };

    expect(payload.subtitle.size_text).toBeNull();
    expect(payload.subtitle.published_text).toBeNull();
    expect(payload.subtitle.published_at).toBeNull();
  });

  it("leaves the episode unnumbered where nothing on the page numbers it", async () => {
    const payload = (await read("subtitle-wordy-number", "880471"))
      .structuredContent as unknown as {
      subtitle: Record<string, unknown>;
    };

    expect(payload.subtitle.season).toBeNull();
    expect(payload.subtitle.episode).toBeNull();
  });

  /**
   * The record page names its language in its own title. A page whose title
   * names none says nothing about which language the file is in.
   */
  it("names no language where the page names none", async () => {
    const payload = (await read("subtitle-no-language", "880472")).structuredContent as unknown as {
      subtitle: Record<string, unknown>;
    };

    expect(payload.subtitle.language).toBeNull();
    expect(payload.subtitle.language_code).toBeNull();
  });

  it("leaves a download count written in words null rather than as none", async () => {
    const payload = (await read("subtitle-odd", "880470")).structuredContent as unknown as {
      subtitle: Record<string, unknown>;
    };

    expect(payload.subtitle.downloads).toBeNull();
  });

  it("leaves the show unnamed where the title names none", async () => {
    const payload = (await read("subtitle-odd", "880470")).structuredContent as unknown as {
      subtitle: Record<string, unknown>;
    };

    expect(payload.subtitle.show_name).toBeNull();
    expect(payload.subtitle.language).toBeNull();
    expect(payload.subtitle.language_code).toBeNull();
  });

  it("leaves both counters unknown where the site drew neither", async () => {
    const payload = (await read("subtitle-no-rating", "880431")).structuredContent as unknown as {
      subtitle: { rating: { good: number | null; bad: number | null } };
    };

    expect(payload.subtitle.rating).toEqual({ good: null, bad: null });
  });

  it("keeps a very long comment whole in the payload while the text stays readable", async () => {
    const result = await read("subtitle-long-comment", "880480");
    const payload = result.structuredContent as unknown as {
      subtitle: { comment: string | null; episode_title: string | null };
    };
    const text = textOf(result);

    expect((payload.subtitle.comment ?? "").length).toBeGreaterThan(1000);
    expect(text.length).toBeLessThan((payload.subtitle.comment ?? "").length);
  });
});

describe("a page holding not one readable row", () => {
  it("is parse_failure on a season", async () => {
    const failure = await fails(
      clientOn(onePage("unreadable", `${BASE}/tvshow-4210-3.html`)).getSeason(4210, 3),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("is parse_failure on a subtitle record", async () => {
    const failure = await fails(
      clientOn(onePage("unreadable", `${BASE}/subtitle-880431.html`)).getSubtitle(880_431),
    );

    expect(failure.code).toBe("parse_failure");
  });

  it("is parse_failure on a search", async () => {
    const failure = await fails(
      clientOn(onePage("unreadable", `${BASE}/search1.php`)).searchShows("harbour"),
    );

    expect(failure.code).toBe("parse_failure");
  });
});
