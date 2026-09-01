import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runGetSubtitle } from "../../src/tools/getSubtitle.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { runListSubtitles } from "../../src/tools/listSubtitles.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import { NOW, type Site, fails, settle, silentLogger, wholeSite } from "./support.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function clientOn(where: Site): TvSubtitlesClient {
  return new TvSubtitlesClient({
    config: loadConfig({}),
    logger: silentLogger(),
    fetchImpl: where.impl,
  });
}

/** What a caller of the published client can hand an address builder. */
const NOT_IDENTIFIERS: [string, unknown][] = [
  ["a path of its own", "4210/../../etc"],
  ["a query of its own", "4210?x=1"],
  ["a word", "harbour"],
  ["nothing at all", ""],
  ["a fraction", 4210.5],
  ["a negative number", -4210],
  ["a number too large to be one", Number.MAX_SAFE_INTEGER + 1],
  ["no number at all", Number.NaN],
  ["no bound at all", Number.POSITIVE_INFINITY],
];

describe("an identifier that is not one", () => {
  for (const [what, value] of NOT_IDENTIFIERS) {
    it(`is refused by getSeason rather than built into an address, given ${what}`, async () => {
      const where = wholeSite();

      const failure = await fails(clientOn(where).getSeason(value as number, 3));

      expect(failure.code).toBe("invalid_input");
      expect(where.calls.length, "a read went out on a bad identifier").toBe(0);
    });

    it(`is refused by getSubtitle, given ${what}`, async () => {
      const where = wholeSite();

      const failure = await fails(clientOn(where).getSubtitle(value as number));

      expect(failure.code).toBe("invalid_input");
      expect(where.calls.length).toBe(0);
    });

    it(`is refused by listEpisodeSubtitles, given ${what}`, async () => {
      const where = wholeSite();

      const failure = await fails(clientOn(where).listEpisodeSubtitles(value as number, undefined));

      expect(failure.code).toBe("invalid_input");
      expect(where.calls.length).toBe(0);
    });
  }

  it("is refused before a season is even considered", async () => {
    const where = wholeSite();

    await fails(clientOn(where).getSeason("harbour" as unknown as number, 3));

    expect(where.calls.length).toBe(0);
  });
});

describe("a season that is not a season", () => {
  for (const season of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`is refused rather than built into an address, given ${season}`, async () => {
      const where = wholeSite();

      const failure = await fails(clientOn(where).getSeason(4210, season));

      expect(failure.code).toBe("invalid_input");
      expect(where.calls.length).toBe(0);
    });
  }
});

describe("an id a tool was handed that the site cannot address", () => {
  async function refusalOf(run: () => Promise<unknown>) {
    const outcome = await settle(run());
    if (outcome.ok) {
      throw new Error("the call was accepted");
    }
    return (outcome.error as { code?: string }).code ?? "";
  }

  it("is refused by get_subtitle", async () => {
    const client = clientOn(wholeSite());

    const code = await refusalOf(() =>
      runGetSubtitle(client, { id: "harbour" } as unknown as Parameters<typeof runGetSubtitle>[1]),
    );

    expect(code).toBe("invalid_input");
  });

  it("is refused by list_subtitles", async () => {
    const client = clientOn(wholeSite());

    const code = await refusalOf(() =>
      runListSubtitles(client, { id: "harbour" } as unknown as Parameters<
        typeof runListSubtitles
      >[1]),
    );

    expect(code).toBe("invalid_input");
  });

  it("is refused by list_languages", async () => {
    const client = clientOn(wholeSite());

    const code = await refusalOf(() =>
      runListLanguages(client, { id: "harbour" } as unknown as Parameters<
        typeof runListLanguages
      >[1]),
    );

    expect(code).toBe("invalid_input");
  });
});
