/**
 * Turning served markup into the strings an answer carries.
 */

import { parseFailure } from "../errors.js";

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the entities the site writes, numeric ones included. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const point = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** The readable text of a fragment of markup, with its whitespace collapsed. */
export const plainText = (markup: string): string =>
  decodeEntities(markup.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** A cell holding nothing but digits, once its grouping is taken out. */
const DIGITS = /^\d+$/;

/**
 * A whole number the site printed, or null when it printed nothing.
 *
 * An empty cell is a figure the site does not publish, and rendering it as zero
 * would put a count on a scale that starts at zero, where the two readings are
 * indistinguishable.
 */
export function readInteger(value: string | undefined | null): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  // The site groups thousands with spaces in its own totals.
  const digits = value.replace(/[\s ,]/g, "");
  if (!DIGITS.test(digits)) {
    return null;
  }
  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * A capture the pattern that produced it always fills.
 *
 * A group left empty by a pattern whose shape guarantees it means the page no
 * longer has the shape this reads, which is a parse failure rather than a blank
 * value to carry forward.
 */
export function captured(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) {
    throw parseFailure("A page came back in a shape this server cannot read.");
  }
  return value;
}

/**
 * Shift a line that would otherwise read as one this server wrote.
 *
 * Text published on the site reaches a model through this server's answers. A
 * line opening `Note:` or `Source:` in an uploader's comment would be read as
 * the server speaking, so the prefix is pushed off the start of the line. The
 * structured payload keeps the text exactly as it was published.
 */
export const indentMarkerLines = (text: string): string =>
  text.replace(/^([ \t]*)(Note|Source|Warning|System):/gim, "$1 $2:");
