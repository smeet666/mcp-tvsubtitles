/**
 * The tool that reads one subtitle's record.
 *
 * It reads the record the site publishes and hands back the page a reader opens
 * to download the file. It fetches no subtitle file, so nothing this tool
 * returns is the subtitle itself.
 */

import { z } from "zod";
import { TvSubtitlesError } from "../errors.js";
import type { TvSubtitlesClient } from "../tvsubtitles/client.js";
import { refusalMessage, strictInput } from "./arguments.js";
import { ok, READS_CATALOGUE_ONLY, SOURCE_NAME, type ToolResult } from "./shared.js";
import { subtitleRowSchema, toSubtitleRow } from "./subtitleRow.js";

export const getSubtitleDescription =
  "Read one subtitle's record on tvsubtitles.net, from an id list_subtitles returned. The record " +
  "carries the episode it belongs to, the release it was cut for, who uploaded it and when, its size " +
  "and how often it was downloaded. Six of the site's ten fields are absent on some records, the " +
  "author on roughly two out of three, and an absent field is null rather than blank. This server " +
  "reads the catalogue: open 'page_url' to download the file.";

export const getSubtitleInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .describe(
      "A subtitle id from list_subtitles. The site answers an id it does not hold by sending the " +
        "reader to its front page, which this reports as an absence.",
    ),
} as const;

export const getSubtitleArgs = strictInput(getSubtitleInput);
export type GetSubtitleArgs = z.infer<typeof getSubtitleArgs>;

export const getSubtitleOutputShape = {
  subtitle: subtitleRowSchema.extend({
    show_name: z.string().nullable().describe("The show the record names."),
    episode_title: z.string().nullable(),
  }),
  cached: z.boolean(),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

export async function runGetSubtitle(
  client: TvSubtitlesClient,
  args: GetSubtitleArgs,
): Promise<ToolResult> {
  const parsed = getSubtitleArgs.safeParse(args);
  if (!parsed.success) {
    throw new TvSubtitlesError("invalid_input", refusalMessage(parsed.error.issues));
  }

  const id = Number.parseInt(parsed.data.id, 10);
  if (!(Number.isSafeInteger(id) && id > 0 && String(id) === parsed.data.id.trim())) {
    throw new TvSubtitlesError(
      "invalid_input",
      `'id' was given '${parsed.data.id}', which is not a subtitle id from list_subtitles.`,
      { hint: "Ids are whole numbers and come back from list_subtitles." },
    );
  }

  const read = await client.getSubtitle(id);
  const record = read.data;
  // The record page names no show id, so none is claimed: crediting the row to
  // the subtitle's own id would give one field two meanings depending on the
  // route that produced the row, and send a caller who follows it to an absence
  // this server invented. The show is named under 'show_name'.
  const row = toSubtitleRow(record, { showId: null, readFrom: "record" });
  const notes: string[] = [READS_CATALOGUE_ONLY];

  if (row.release_match === "none") {
    notes.push(
      "The site published no release for this record, so nothing here says which video it is timed to.",
    );
  }
  if (row.uploader === null) {
    notes.push("The site printed no author for this record.");
  }

  const heading = [
    record.showName,
    row.season && row.episode ? `${row.season}x${String(row.episode).padStart(2, "0")}` : null,
    record.episodeTitle,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const body = [
    /* v8 ignore start -- A record naming no show at all needs a page whose
       title matches while carrying an empty name, and whose 'episode number'
       and 'episode title' are both absent. SITE-NOTES.md measures those two
       present on 50 records out of 50, so the empty heading guards against a
       page the site does not serve. */
    heading === "" ? `Subtitle ${row.id} on tvsubtitles.net.` : `${heading}.`,
    /* v8 ignore stop */
    `Language: ${row.language ?? "unstated"}.`,
    `Release: ${row.releases.length > 0 ? row.releases.join(", ") : "none published"}.`,
    `Uploaded: ${row.published_text ?? "unstated"}${row.uploader ? ` by ${row.uploader}` : ""}.`,
    `Downloads: ${row.downloads ?? "unstated"}. Size: ${row.size_text ?? "unstated"}.`,
    `Download page: ${row.page_url}`,
  ].join("\n");

  return ok(
    {
      subtitle: { ...row, show_name: record.showName, episode_title: record.episodeTitle },
      cached: read.cached,
      source: SOURCE_NAME,
      notes,
    },
    body,
    { notes },
  );
}
