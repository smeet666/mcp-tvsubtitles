import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { runListLanguages } from "../../src/tools/listLanguages.js";
import { TvSubtitlesClient } from "../../src/tvsubtitles/client.js";
import {
  NOW,
  type Site,
  fixture,
  html,
  settle,
  silentLogger,
  site,
  textOf,
  wholeSite,
} from "./support.js";

type Args = Parameters<typeof runListLanguages>[1];

interface Payload {
  languages: Array<{
    name: string;
    site_code: string;
    code: string | null;
    differs_from_iso: boolean;
    count: number | null;
  }>;
  language_count: number;
  scope: "catalogue" | "season";
  show_id: string | null;
  show_name: string | null;
  season: number | null;
  cached: boolean;
  source: string;
  notes: string[];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, "random").mockReturnValue(0);
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

async function run(value: Record<string, unknown>, where: Site = wholeSite()) {
  const outcome = await settle(runListLanguages(clientOn(where), value as unknown as Args));
  if (!outcome.ok) {
    throw outcome.error;
  }
  return outcome.value;
}

async function refusalOf(value: Record<string, unknown>, where: Site = wholeSite()) {
  const outcome = await settle(runListLanguages(clientOn(where), value as unknown as Args));
  if (outcome.ok) {
    throw new Error(`the call was accepted: ${JSON.stringify(outcome.value.structuredContent)}`);
  }
  const error = outcome.error as { code?: string; message?: string };
  return { code: error.code ?? "", message: error.message ?? "" };
}

describe("the catalogue, asked for without a show", () => {
  it("names its scope and leaves every field a show would have filled null", async () => {
    const payload = (await run({})).structuredContent as unknown as Payload;

    expect(payload.scope).toBe("catalogue");
    expect(payload.show_id).toBeNull();
    expect(payload.show_name).toBeNull();
    expect(payload.season).toBeNull();
  });

  it("counts nothing per language, because the catalogue publishes no such count", async () => {
    const payload = (await run({})).structuredContent as unknown as Payload;

    for (const language of payload.languages) {
      expect(language.count, `${language.site_code} carries a count`).toBeNull();
    }
  });

  it("asks the site for nothing at all", async () => {
    const where = wholeSite();

    await run({}, where);

    expect(where.calls.length).toBe(0);
  });

  it("ignores a season, since the catalogue has no season", async () => {
    const where = wholeSite();
    const payload = (await run({ season: 3 }, where)).structuredContent as unknown as Payload;

    expect(payload.scope).toBe("catalogue");
    expect(payload.season).toBeNull();
    expect(where.calls.length).toBe(0);
  });

  /**
   * A caller that passed a season and got the catalogue has to be able to see
   * that nothing was measured over one, rather than read the answer as that
   * season's languages.
   */
  it("states in the answer itself that no season was measured", async () => {
    const payload = (await run({ season: 3 })).structuredContent as unknown as Payload;

    expect(payload.scope).toBe("catalogue");
    expect(payload.season).toBeNull();
    for (const language of payload.languages) {
      expect(language.count).toBeNull();
    }
  });
});

describe("one show's languages", () => {
  it("names its scope and the show the site printed", async () => {
    const payload = (await run({ id: "4210" })).structuredContent as unknown as Payload;

    expect(payload.scope).toBe("season");
    expect(payload.show_id).toBe("4210");
    expect(payload.show_name).toBe("Harbour Lights");
  });

  it("reads the newest season when none was asked for, and says which that was", async () => {
    const payload = (await run({ id: "4210" })).structuredContent as unknown as Payload;

    expect(payload.season).toBe(3);
  });

  it("reads the season it was asked for", async () => {
    const payload = (await run({ id: "4210", season: 3 })).structuredContent as unknown as Payload;

    expect(payload.season).toBe(3);
  });

  it("counts, for each language, the episodes of that season holding it", async () => {
    const payload = (await run({ id: "4210", season: 3 })).structuredContent as unknown as Payload;
    const counted = new Map(
      payload.languages.map((language) => [language.site_code, language.count]),
    );

    expect(counted.get("en")).toBe(2);
    expect(counted.get("fr")).toBe(1);
    expect(counted.get("br")).toBe(1);
  });

  it("leaves out a language the season holds nothing in", async () => {
    const payload = (await run({ id: "4210", season: 3 })).structuredContent as unknown as Payload;
    const codes = payload.languages.map((language) => language.site_code);

    expect(codes).not.toContain("ko");
    expect(codes.length).toBeLessThan(24);
    expect(payload.language_count).toBe(payload.languages.length);
  });

  it("keeps the site's own naming and the tag where the mapping is certain", async () => {
    const payload = (await run({ id: "4210", season: 3 })).structuredContent as unknown as Payload;
    const brazilian = payload.languages.find((language) => language.site_code === "br");

    expect(brazilian?.name).toBe("portuguese(br)");
    expect(brazilian?.code).toBe("pt-BR");
    expect(brazilian?.differs_from_iso).toBe(true);
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("breton");
  });

  it("says the count is episodes of one season rather than files of a catalogue", async () => {
    const result = await run({ id: "4210", season: 3 });
    const payload = result.structuredContent as unknown as Payload;

    expect(payload.notes.join(" ")).toMatch(/episode/i);
    expect(payload.notes.join(" ")).toMatch(/season/i);
  });

  it("lets every note reach the text a client renders on its own", async () => {
    const result = await run({ id: "4210", season: 3 });
    const payload = result.structuredContent as unknown as Payload;
    const text = textOf(result);

    for (const note of payload.notes) {
      expect(text, `a note never reached the text block: ${note}`).toContain(note);
    }
  });

  it("carries a link back to the show's own page", async () => {
    const text = textOf(await run({ id: "4210", season: 3 }));

    expect(text).toContain("tvsubtitles.net");
  });

  it("says whether the season came from memory", async () => {
    const where = wholeSite();
    const client = clientOn(where);
    const args = { id: "4210", season: 3 } as unknown as Args;

    const first = await settle(runListLanguages(client, args));
    const second = await settle(runListLanguages(client, args));

    expect(first.ok && (first.value.structuredContent as unknown as Payload).cached).toBe(false);
    expect(second.ok && (second.value.structuredContent as unknown as Payload).cached).toBe(true);
  });
});

describe("a show whose season holds nothing", () => {
  it("answers no language rather than the whole catalogue", async () => {
    const where = site([[/./, (call) => html(fixture("season-empty-coverage"), call.url)]]);

    const payload = (await run({ id: "4210", season: 3 }, where))
      .structuredContent as unknown as Payload;

    expect(payload.languages).toEqual([]);
    expect(payload.language_count).toBe(0);
    expect(payload.scope).toBe("season");
  });
});

describe("what the site answers instead of a refusal", () => {
  it("reads a show id it does not hold as not_found", async () => {
    const where = site([[/./, (call) => html(fixture("season-unknown-show"), call.url)]]);

    const failure = await refusalOf({ id: "999999" }, where);

    expect(failure.code).toBe("not_found");
  });

  it("reads a season past the last one as not_found rather than a show holding no language", async () => {
    const failure = await refusalOf({ id: "4210", season: 9 });

    expect(failure.code).toBe("not_found");
  });
});
