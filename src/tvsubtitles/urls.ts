/**
 * Every address this server builds, in one place.
 *
 * The site addresses a show by a numeric id and a season, an episode and a
 * subtitle by an id of their own. Ids come back from a listing and are never
 * assembled from a name, because the site answers an id it does not hold with a
 * page rather than with a refusal.
 */

import { invalidInput } from "../errors.js";

export const BASE_URL = "https://www.tvsubtitles.net";

/**
 * A number that may be written into a path.
 *
 * The types below say these are numbers, and TypeScript holds a caller of this
 * package to that. The client layer is published on its own subpath, so a
 * JavaScript program importing it is held to nothing: anything it passes lands
 * in the path as it stands, where a segment separator or a traversal would
 * address a page nobody asked for. Refusing here is what makes the type an
 * argument rather than a hope.
 */
function pathNumber(value: number, named: string): string {
  if (!(typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) {
    throw invalidInput(
      `'${named}' has to be a whole number, and ${JSON.stringify(value)} is not one.`,
      "Ids come back from a listing on this site and are never assembled by hand.",
    );
  }
  return String(value);
}

/** The shape of every code the site addresses a language by. */
const TWO_LETTERS = /^[a-z]{2}$/;

/**
 * A language code that may be written into a path.
 *
 * The site draws twenty-four flags and addresses each language by two letters
 * of its own, so anything else is not a language it holds.
 */
function pathCode(value: string, named: string): string {
  if (!(typeof value === "string" && TWO_LETTERS.test(value))) {
    throw invalidInput(
      `'${named}' has to be one of the site's two-letter language codes.`,
      "Call list_languages to see the twenty-four it draws.",
    );
  }
  return value;
}

/** The whole catalogue, one row per show. */
export const showIndexUrl = (): string => `${BASE_URL}/tvshows.html`;

/**
 * One season of one show.
 *
 * Season 0 is the site's own way of asking for the newest season, and it
 * answers with a redirect to that season's address. A caller reading the answer
 * has to be told which season it received rather than which it asked for.
 */
export const seasonUrl = (showId: number, season: number): string =>
  `${BASE_URL}/tvshow-${pathNumber(showId, "showId")}-${pathNumber(season, "season")}.html`;

/** One episode, every language the site holds for it. */
export const episodeUrl = (episodeId: number): string =>
  `${BASE_URL}/episode-${pathNumber(episodeId, "episodeId")}.html`;

/** One episode narrowed to one language, in the site's own two-letter code. */
export const episodeLanguageUrl = (episodeId: number, siteCode: string): string =>
  `${BASE_URL}/episode-${pathNumber(episodeId, "episodeId")}-${pathCode(siteCode, "siteCode")}.html`;

/** One subtitle's record. */
export const subtitleUrl = (subtitleId: number): string =>
  `${BASE_URL}/subtitle-${pathNumber(subtitleId, "subtitleId")}.html`;

/** Where the site takes a search of its own form. */
export const searchUrl = (): string => `${BASE_URL}/search1.php`;

/**
 * Whether an address is the site's front page.
 *
 * The site answers a subtitle id it does not hold by sending the reader home,
 * so a read that finishes here asked for something the site does not have.
 */
export const isFrontPage = (url: string): boolean => {
  const path = new URL(url).pathname;
  return path === "/" || path === "/index.html";
};
