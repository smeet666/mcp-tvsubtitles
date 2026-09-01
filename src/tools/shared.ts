/** Rendering and error mapping shared by the tools. */

import { TvSubtitlesError } from "../errors.js";

/**
 * Many MCP clients render only the text block, so it has to answer on its own.
 * This ceiling is what keeps a long listing from arriving as a wall of text.
 */
export const MAX_TEXT_CHARS = 2200;

/** The name every answer credits, and the value the structured output carries. */
export const SOURCE_NAME = "tvsubtitles.net";
export const ATTRIBUTION = `Source: ${SOURCE_NAME}`;

export interface ToolResult {
  // The SDK's result type carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * A line opening the way this server's own trailer lines open.
 *
 * Show names, episode titles and uploader comments all reach this block, and a
 * reader has no way to tell one of those from a line the server wrote. Leading
 * whitespace is part of the forgery, so it is matched too.
 */
const MARKER_LINE = /^[ \t]*(?:note|source|warning|system)[ \t ]*:/gim;

/**
 * The characters that reorder a line rather than say anything in it.
 *
 * An override or an embedding makes what follows read in the other direction,
 * which turns this server's own words, its notes and its credit line, around
 * without altering one of them. It is the same forgery the marker lines guard
 * against, worked on a line's direction instead of its wording, so it is
 * answered in the same place: the rendered block. Nothing here reaches a
 * right-to-left script, which the reading algorithm lays out on its own without
 * any of these.
 */
const DIRECTION_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;

/**
 * Keep text from the site out of the shape this server's own lines take.
 *
 * Quoting survives a reader trimming the line, where a leading space would not.
 * The structured output still carries the text exactly as it was published.
 */
function quoteMarkerLines(body: string): string {
  return body
    .replace(DIRECTION_CONTROLS, "")
    .replace(MARKER_LINE, (whole) => `> ${whole.trimStart()}`);
}

/**
 * Build a result whose text block ends with its notes and its credit.
 *
 * The body is truncated to fit around the trailer rather than the whole block
 * being cut afterwards. Appending the credit and then truncating loses exactly
 * the credit, which is the one line that must survive.
 *
 * The notes belong to the trailer for the same reason. They are what qualifies
 * an answer, saying that a list is an excerpt or that a count states a floor. A
 * client rendering only the text reads an unqualified answer without them.
 */
export function ok(
  structured: Record<string, unknown>,
  body: string,
  options: { notes?: string[] } = {},
): ToolResult {
  const safe = quoteMarkerLines(body);
  // Measured before the trailer is built, because a cut has to be announced in
  // the trailer that the cut is then measured against.
  const provisional = trailerOf(options.notes ?? []);
  const wouldCut = safe.length > Math.max(0, MAX_TEXT_CHARS - provisional.length - 2);

  const trailer = trailerOf([...(options.notes ?? []), ...(wouldCut ? [CUT_NOTE] : [])]);
  const cut = "…";
  const budget = Math.max(0, MAX_TEXT_CHARS - trailer.length - 2);
  const text =
    safe.length <= budget
      ? `${safe}\n\n${trailer}`
      : `${truncate(safe, Math.max(0, budget - cut.length))}${cut}\n\n${trailer}`;

  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * Said when the block below is shorter than what the answer holds.
 *
 * Every other cut this server makes is announced. A listing broken off partway,
 * on a client that renders only this block, would read as the whole of it.
 */
const CUT_NOTE =
  "This text block was cut to fit. The structured payload beside it carries the answer whole.";

const trailerOf = (notes: readonly string[]): string =>
  [...notes.map((note) => `Note: ${note}`), ATTRIBUTION].join("\n");

/**
 * Errors carry no structured payload: the SDK checks it against the tool's
 * declared output schema, and a failure does not fit that shape.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof TvSubtitlesError
      ? error
      : new TvSubtitlesError(
          "network_error",
          error instanceof Error ? error.message : String(error),
        );

  const lines = [`[${known.code}] ${known.message}`];
  if (known.details.hint) {
    lines.push(`Hint: ${known.details.hint}`);
  }
  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

/**
 * The one place the download page is named.
 *
 * This server reads the catalogue and hands back the address a reader opens for
 * themselves. It fetches no subtitle file, so every answer ends at a link.
 */
export const READS_CATALOGUE_ONLY =
  "This server reads the catalogue. Open 'page_url' to download the file itself.";
