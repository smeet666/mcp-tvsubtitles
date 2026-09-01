#!/usr/bin/env node
/**
 * Writes the corpus the unit suite reads.
 *
 * Every show, episode, uploader and release named here is invented. The tag
 * shapes come from `docs/SITE-MARKUP.md`, so nothing tvsubtitles.net publishes
 * is stored in this repository. Writing the corpus rather than capturing it
 * also gives the suite pages the site has never served: a season past the last
 * one, a stamp naming a day its month does not hold, a comment shaped like a
 * line this server writes.
 *
 * The script takes no input and draws no random value, so running it twice
 * writes the same bytes and the integration job can demand no diff.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "test", "fixtures");
mkdirSync(out, { recursive: true });

/**
 * The footer every page carries. These four numbers count the whole site and
 * answer no search, so the corpus repeats them everywhere the site does.
 */
const FOOTER = `<div id="footer">Total subtitles: 304847 TV Shows: 2818 TV Episodes: 86818 Downloads: 523 807 767</div>`;

/** The navigation, which carries links of the very shape the parsers read. */
const CHROME = `<div id="menu">
<a href="tvshows.html">TV shows</a> | <a href="new.html">New subtitles</a> |
<a href="tvshow-4210-1.html">Season 1</a>
</div>`;

const page = (title, body) => `<!DOCTYPE html>
<html><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<title>${title}</title>
</head><body>
${CHROME}
${body}
${FOOTER}
</body></html>
`;

/* ------------------------------------------------------------------ index */

const indexHeader = `<tr align="middle"><th bgcolor="#111111" width="5%"><b>#</b></th>
<th bgcolor="#111111" width="55%"><b>Name</b></th>
<th bgcolor="#111111" width="5%"><b>Seasons</b></th>
<th bgcolor="#111111" width="5%"><b>Episodes</b></th>
<th bgcolor="#111111" width="5%"><b>Subtitles</b></th>
<th bgcolor="#111111" width="15%"><b>Year</b></th>
</tr>`;

const indexRow = ({ rank, id, name, seasons, episodes, subtitles, year }) =>
  `<tr align="middle" bgcolor="#ffffff">
  <td>${rank}</td>
  <td align=left style="padding: 0 4px;"><a href="tvshow-${id}-0.html"><b>${name}</b></a></td>
  <td>${seasons}</td>
  <td>${episodes}</td>
  <td>${subtitles}</td>
  <td>${year}</td>
</tr>`;

/**
 * The index the suite reads.
 *
 * Row 3 prints no episode count and row 4 prints neither, which is what an
 * empty cell means: the site published nothing. Rows 6 to 10 are the payloads
 * the site's own add form let through, and row 11 is an ordinary show whose
 * name holds an apostrophe, so a parser dropping every quote drops it too.
 * Row 12 opens with a word this server uses to introduce its own notes.
 */
const showsIndex = page(
  "TVsubtitles.net - TV shows",
  `<table>
${indexHeader}
${indexRow({ rank: 1, id: 4210, name: "Harbour Lights", seasons: 3, episodes: 28, subtitles: 412, year: "2011-2014" })}
${indexRow({ rank: 2, id: 4211, name: "The Ninth Wave", seasons: 1, episodes: 8, subtitles: 61, year: "2019" })}
${indexRow({ rank: 3, id: 4212, name: "Copper Kettle Lane", seasons: 2, episodes: "", subtitles: 44, year: "2005-2007" })}
${indexRow({ rank: 4, id: 4213, name: "Saltmarsh", seasons: 1, episodes: "", subtitles: "", year: "2021" })}
${indexRow({ rank: 5, id: 4214, name: "Glasshouse", seasons: 5, episodes: 60, subtitles: 903, year: "1998-2003" })}
${indexRow({ rank: 6, id: 4106, name: "&quot; OR 1=1-- -", seasons: 1, episodes: 1, subtitles: 1, year: "2020" })}
${indexRow({ rank: 7, id: 4151, name: "' ORDER BY 1000-- -", seasons: 1, episodes: 1, subtitles: 1, year: "2020" })}
${indexRow({ rank: 8, id: 4160, name: "", seasons: 1, episodes: 1, subtitles: 1, year: "2020" })}
${indexRow({ rank: 9, id: 4161, name: "admin'-- -", seasons: 1, episodes: 1, subtitles: 1, year: "2020" })}
${indexRow({ rank: 10, id: 4162, name: "1' UNION SELECT NULL,NULL-- -", seasons: 1, episodes: 1, subtitles: 1, year: "2020" })}
${indexRow({ rank: 11, id: 4215, name: "Bishop's Landing", seasons: 2, episodes: 16, subtitles: 120, year: "2016-2018" })}
${indexRow({ rank: 12, id: 4216, name: "Note: The Quiet Hour", seasons: 1, episodes: 6, subtitles: 12, year: "2022" })}
${indexRow({ rank: 13, id: 4217, name: "Salt &amp; Pepper &#39;74", seasons: 1, episodes: 6, subtitles: 12, year: "1974" })}
</table>`,
);

/** The same index with no footer, which is where the site's own totals live. */
const showsIndexNoFooter = showsIndex.replace(FOOTER, "");

/* ----------------------------------------------------------------- search */

const searchHit = (id, name, years, codes) =>
  `<li style="font-size: 120%; font-weight:bold; margin:10px 0"><div style="">
  <a href="/tvshow-${id}.html">${name} (${years})</a>&nbsp;&nbsp;&nbsp;
  ${codes
    .map(
      (code) =>
        `<img src="images/flags/${code}.gif" width="18" height="12" alt="${code}" border=0 align=absmiddle>`,
    )
    .join("&nbsp;\n  ")}
</div></li>`;

const searchPage = (items) =>
  page(
    "TVsubtitles.net - Search",
    `<p class="description">Search results</p><p><ul style="margin-left:2em">
${items.join("\n")}
</ul>`,
  );

const searchMatches = searchPage([
  searchHit(4210, "Harbour Lights", "2011-2014", ["en", "fr", "br"]),
  searchHit(4212, "Copper Kettle Lane", "2005-2007", ["en"]),
  searchHit(4216, "Note: The Quiet Hour", "2022", ["en"]),
  searchHit(4106, "&quot; OR 1=1-- -", "2020", ["en"]),
  searchHit(4160, "", "2020", ["en"]),
]);

const searchEmpty = searchPage([]);

/* ----------------------------------------------------------------- season */

/**
 * The paragraph naming every season the site holds for a show.
 *
 * The season being displayed is printed in bold with no link around it, and the
 * others are printed as links. A season the site does not hold is left out of
 * the paragraph even when its page is served, which is what tells a season past
 * the last one from one that exists.
 */
const seasonList = (id, seasons, current) =>
  seasons
    .map((season) =>
      season === current
        ? `<font color="#3BAE09"><b>Season ${season}</b></font>`
        : `<a href="tvshow-${id}-${season}.html"><b>Season ${season}</b></a>`,
    )
    .join(" | ");

/**
 * One flag cell. A language holding one subtitle links straight to the record,
 * a language holding several links to the episode in that language, and a
 * language holding nothing is a blank image with no link at all.
 */
const flag = (spec) => {
  if (spec.kind === "blank") {
    return `<img src="images/flags/blank.gif" width="18" height="12" alt="" border=0>`;
  }
  const image = `<img src="images/flags/${spec.code}.gif" width="18" height="12" alt="${spec.code}" border=0>`;
  const href =
    spec.kind === "one"
      ? `subtitle-${spec.target}.html`
      : `episode-${spec.target}-${spec.code}.html`;
  return `<a href="${href}">${image}</a>`;
};

const seasonRow = (code, episodeId, title, amount, flags) =>
  `<tr align="middle" bgcolor="#ffffff">
  <td>${code}</td>
  <td align=left style="padding: 0 4px;"><a href="episode-${episodeId}.html"><b>${title}</b></a></td>
  <td>${amount}</td>
  <td><nobr>
    ${flags.map(flag).join("&nbsp;\n    ")}
  </nobr></td>
</tr>`;

const seasonHeader = `<tr align="middle"><th bgcolor="#111111" width="8%"><b>#</b></th>
<th bgcolor="#111111" width="40%"><b>Episode</b></th>
<th bgcolor="#111111" width="7%"><b>Amount</b></th>
<th bgcolor="#111111" width="45%"><b>Subtitles</b></th>
</tr>`;

const seasonPage = (name, season, links, rows) =>
  page(
    `TVsubtitles.net - Subtitles "${name}" season ${season}`,
    `<h2>${name}</h2>
<p class="description">${links}</p>
<table>
${seasonHeader}
${rows.join("\n")}
</table>`,
  );

const seasonFull = seasonPage("Harbour Lights", 3, seasonList(4210, [1, 2, 3], 3), [
  seasonRow("3x07", 52_118, "The Long Way Round", 5, [
    { kind: "many", code: "en", target: 52_118 },
    { kind: "blank" },
    { kind: "one", code: "fr", target: 880_431 },
    { kind: "one", code: "br", target: 880_437 },
  ]),
  seasonRow("3x08", 52_119, "Slack Water", 2, [
    { kind: "one", code: "en", target: 880_440 },
    { kind: "blank" },
    { kind: "blank" },
    { kind: "blank" },
  ]),
  // Every language blank: the episode is listed and holds nothing at all.
  seasonRow("3x09", 52_120, "Note: Harbour Master", "", [
    { kind: "blank" },
    { kind: "blank" },
    { kind: "blank" },
    { kind: "blank" },
  ]),
]);

/** A row whose cells the site did not finish writing. */
const seasonBrokenRow = seasonPage("Harbour Lights", 3, seasonList(4210, [1, 2, 3], 3), [
  `<tr align="middle" bgcolor="#ffffff"><td>3x07</td></tr>`,
  seasonRow("3x08", 52_119, "Slack Water", 2, [{ kind: "one", code: "en", target: 880_440 }]),
]);

/** A season listing its episodes while no language holds any of them. */
const seasonEmptyCoverage = seasonPage("Harbour Lights", 3, seasonList(4210, [1, 2, 3], 3), [
  seasonRow("3x07", 52_118, "The Long Way Round", "", [{ kind: "blank" }, { kind: "blank" }]),
  seasonRow("3x08", 52_119, "Slack Water", "", [{ kind: "blank" }, { kind: "blank" }]),
]);

/** A show id the site does not hold: HTTP 200, empty name, no rows. */
const seasonUnknownShow = seasonPage("", 1, "", []);

/** A season past the last one: the real name, the real links, no rows. */
const seasonPastLast = seasonPage("Harbour Lights", 9, seasonList(4210, [1, 2, 3], 9), []);

/* ---------------------------------------------------------------- episode */

/**
 * One labelled cell of a subtitle block. A cell the site printed nothing for
 * still carries its paragraph and its image, with nothing after them.
 */
const cell = (label, image, value, width) =>
  `  <p style="width:${width}px;" alt="${label}" title="${label}"><img src="images/${image}" width="16" height="16" alt="${label}" title="${label}" border=0 hspace=4 align="absmiddle">${value === null ? "" : ` ${value}`}</p>`;

const episodeBlock = ({
  id,
  code,
  heading,
  rip,
  release,
  uploaded,
  author,
  downloads,
  bad,
  good,
}) =>
  `<a href="/subtitle-${id}.html"><div title="Download ${code} subtitles" class="subtitlen">
  <div style="float:right; margin:0 2px;"><span style="color:black; font-weight:bold">
    <span style="color:red">${bad}</span>/<span style="color:green">${good}</span></span></div>
  <h5 style="width:600px;"><img src="images/flags/${code}.gif" width="18" height="12" alt="" border=0 hspace=4 align=absmiddle>${heading}</h5>
${cell("rip", "rip.gif", rip, 110)}
${cell("release", "release.gif", release, 110)}
${cell("uploaded", "time.png", uploaded === null ? null : `<small>${uploaded}</small>`, 70)}
${cell("author", "user.png", author === null ? null : `<nobr><small>${author}</small></nobr>`, 120)}
${cell("downloaded", "downloads.png", downloads, 100)}
</div></a>`;

const episodePage = (title, heading, blocks) =>
  page(
    title,
    `<b>${heading}</b>
<b>Subtitles for this episode:</b>
${blocks.join("\n")}`,
  );

/** One language, reached through `episode-<id>-<lang>.html`. */
const episodeOneLanguage = episodePage(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x07",
  "Harbour Lights 3x07</b>&nbsp; <b>The Long Way Round</b> (Season 3 Episode 7)",
  [
    episodeBlock({
      id: 880_431,
      code: "en",
      heading: "Harbour Lights 3x07 (HDTV.LOL)",
      rip: "HDTV",
      release: "LOL",
      uploaded: "04.02.14 09:12:30",
      author: "rivermouth",
      downloads: "318",
      bad: 0,
      good: 2,
    }),
    episodeBlock({
      id: 880_432,
      code: "en",
      heading: "Harbour Lights 3x07 (HDTV.lol)",
      rip: "HDTV",
      release: "lol",
      uploaded: "05.02.14 21:00:00",
      author: null,
      downloads: "12",
      bad: 0,
      good: 0,
    }),
  ],
);

/** Every language the episode holds, reached through `episode-<id>.html`. */
const episodeManyLanguages = episodePage(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x07",
  "Harbour Lights 3x07</b>&nbsp; <b>The Long Way Round</b> (Season 3 Episode 7)",
  [
    episodeBlock({
      id: 880_431,
      code: "en",
      heading: "Harbour Lights 3x07 (HDTV.LOL)",
      rip: "HDTV",
      release: "LOL",
      uploaded: "04.02.14 09:12:30",
      author: "rivermouth",
      downloads: "318",
      bad: 0,
      good: 2,
    }),
    episodeBlock({
      id: 880_435,
      code: "fr",
      heading: "Harbour Lights 3x07 (WEB.NF)",
      rip: "WEB",
      release: "NF",
      uploaded: "06.02.14 11:45:02",
      author: "quaiside",
      downloads: "77",
      bad: 0,
      good: 0,
    }),
    // Neither medium nor group: the row says nothing about the video it fits.
    episodeBlock({
      id: 880_437,
      code: "br",
      heading: "Harbour Lights 3x07",
      rip: null,
      release: null,
      uploaded: "07.02.14 08:00:00",
      author: null,
      downloads: "9",
      bad: 0,
      good: 0,
    }),
  ],
);

/** One language holding one record, which is what a narrowed read serves. */
const episodeLanguageFrench = episodePage(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x07",
  "Harbour Lights 3x07</b>&nbsp; <b>The Long Way Round</b> (Season 3 Episode 7)",
  [
    episodeBlock({
      id: 880_435,
      code: "fr",
      heading: "Harbour Lights 3x07 (WEB.NF)",
      rip: "WEB",
      release: "NF",
      uploaded: "06.02.14 11:45:02",
      author: "quaiside",
      downloads: "77",
      bad: 0,
      good: 0,
    }),
  ],
);

/** The next episode, which one language holds one record of and no other holds. */
const episodeSlackWaterEnglish = episodePage(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x08",
  "Harbour Lights 3x08</b>&nbsp; <b>Slack Water</b> (Season 3 Episode 8)",
  [
    episodeBlock({
      id: 880_440,
      code: "en",
      heading: "Harbour Lights 3x08 (WEB.NF)",
      rip: "WEB",
      release: "NF",
      uploaded: "11.03.14 07:04:09",
      author: "quaiside",
      downloads: "44",
      bad: 0,
      good: 0,
    }),
  ],
);

/** The same episode in a language holding nothing of it. */
const episodeSlackWaterEmpty = episodePage(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x08",
  "Harbour Lights 3x08</b>&nbsp; <b>Slack Water</b> (Season 3 Episode 8)",
  [],
);

/** A language holding nothing for this episode: the page, and no record on it. */
const episodeLanguageEmpty = episodePage(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x07",
  "Harbour Lights 3x07</b>&nbsp; <b>The Long Way Round</b> (Season 3 Episode 7)",
  [],
);

/** An episode id the site does not hold: the heading loses its numbers. */
const episodeUnknown = episodePage(
  "TVsubtitles.net - Subtitles",
  "x</b>&nbsp; <b></b> (Season Episode )",
  [],
);

/* --------------------------------------------------------------- subtitle */

const pair = (label, value) => `<div><b>${label}:</b></div><div>${value}</div>`;

const subtitlePage = ({ id, title, fields, bad = 0, good = 0 }) =>
  page(
    title,
    `${fields.map(([label, value]) => pair(label, value)).join("\n")}
<div><nobr><b><a href="report_bad.php?sid=${id}" rel="nofollow">Report bad</a></b></nobr></div>
<b id="hate" style="color:red; font-size:14px;">${bad}</b>
<b id="love" style="color:green; font-size:14px;">${good}</b>
<a href="download-${id}.html">Download</a>`,
  );

const RECORD_TITLE =
  'TVsubtitles.net - Download english subtitles for Harbour Lights 3x07 (season 3 episode 07 - "The Long Way Round")';

/** All ten labels, which is the record the presence table calls complete. */
const subtitleFull = subtitlePage({
  id: 880_431,
  title: RECORD_TITLE,
  bad: 0,
  good: 2,
  fields: [
    ["episode title", "The Long Way Round"],
    ["episode number", "Season 3 episode 7"],
    ["rip", "HDTV"],
    ["release", "LOL"],
    ["comment", "Synced against the broadcast cut."],
    ["author", "rivermouth"],
    ["filename", "Harbour Lights - 3x07 - The Long Way Round.HDTV.LOL.en.srt"],
    ["size", "21.4 kb"],
    ["uploaded", "04.02.14 09:12:30"],
    ["number of downloads", "318"],
  ],
});

/** No author, which is two records out of three. */
const subtitleNoAuthor = subtitlePage({
  id: 880_432,
  title: RECORD_TITLE,
  fields: [
    ["episode title", "The Long Way Round"],
    ["episode number", "Season 3 episode 7"],
    ["rip", "HDTV"],
    ["release", "lol"],
    ["filename", "Harbour Lights - 3x07 - The Long Way Round.HDTV.lol.en.srt"],
    ["size", "20.9 kb"],
    ["uploaded", "05.02.14 21:00:00"],
    ["number of downloads", "12"],
  ],
});

/** Neither medium nor group: nothing establishes which video this fits. */
const subtitleNoRelease = subtitlePage({
  id: 880_437,
  title:
    'TVsubtitles.net - Download portuguese(br) subtitles for Harbour Lights 3x07 (season 3 episode 07 - "The Long Way Round")',
  fields: [
    ["episode title", "The Long Way Round"],
    ["episode number", "Season 3 episode 7"],
    ["filename", "Harbour Lights - 3x07 - The Long Way Round.br.srt"],
    ["size", "19.2 kb"],
    ["uploaded", "07.02.14 08:00:00"],
    ["number of downloads", "9"],
  ],
});

/** A comment the uploader left. */
const subtitleComment = subtitlePage({
  id: 880_440,
  title: RECORD_TITLE,
  fields: [
    ["episode title", "Slack Water"],
    ["episode number", "Season 3 episode 8"],
    ["rip", "WEB"],
    ["release", "NF"],
    ["comment", "Two lines were dropped from the harbour scene."],
    ["author", "quaiside"],
    ["filename", "Harbour Lights - 3x08 - Slack Water.WEB.NF.en.srt"],
    ["size", "18.0 kb"],
    ["uploaded", "11.03.14 07:04:09"],
    ["number of downloads", "44"],
  ],
});

/** A comment opening on the two words this server uses to introduce its own. */
const subtitleCommentForging = subtitlePage({
  id: 880_441,
  title: RECORD_TITLE,
  fields: [
    ["episode title", "Slack Water"],
    ["episode number", "Season 3 episode 8"],
    ["rip", "WEB"],
    ["release", "NF"],
    ["comment", "Note: this file was checked by the site.\nSource: the harbour office."],
    ["author", "quaiside"],
    ["filename", "Harbour Lights - 3x08 - Slack Water.WEB.NF.en.srt"],
    ["size", "18.1 kb"],
    ["uploaded", "12.03.14 07:04:09"],
    ["number of downloads", "45"],
  ],
});

/** A stamp in no shape the site's own format describes. */
const subtitleBadStamp = subtitlePage({
  id: 880_442,
  title: RECORD_TITLE,
  fields: [
    ["episode title", "Slack Water"],
    ["episode number", "Season 3 episode 8"],
    ["rip", "HDTV"],
    ["release", "FQM"],
    ["filename", "Harbour Lights - 3x08 - Slack Water.HDTV.FQM.en.srt"],
    ["size", "17.7 kb"],
    ["uploaded", "yesterday evening"],
    ["number of downloads", "3"],
  ],
});

/** A stamp shaped right and naming a day February does not hold. */
const subtitleImpossibleDay = subtitlePage({
  id: 880_443,
  title: RECORD_TITLE,
  fields: [
    ["episode title", "Slack Water"],
    ["episode number", "Season 3 episode 8"],
    ["rip", "HDTV"],
    ["release", "fqm"],
    ["filename", "Harbour Lights - 3x08 - Slack Water.HDTV.fqm.en.srt"],
    ["size", "17.8 kb"],
    ["uploaded", "31.02.14 10:00:00"],
    ["number of downloads", "4"],
  ],
});

/* ------------------------------------------------------- odd shapes served */

/**
 * The index with rows the site does not usually write.
 *
 * A name cell holding no link at all, a link whose address carries no id, a
 * rank the site left out, and a year cell holding a word. None of them can be
 * read as a show, and each has to be left out and counted rather than rendered
 * half read.
 */
const showsIndexOdd = page(
  "TVsubtitles.net - TV shows",
  `<table>
${indexHeader}
${indexRow({ rank: 1, id: 4210, name: "Harbour Lights", seasons: 3, episodes: 28, subtitles: 412, year: "2011-2014" })}
<tr align="middle" bgcolor="#ffffff">
  <td>2</td>
  <td align=left style="padding: 0 4px;"><b>Copper Kettle Lane</b></td>
  <td>2</td><td>16</td><td>44</td><td>2005-2007</td>
</tr>
<tr align="middle" bgcolor="#ffffff">
  <td>3</td>
  <td align=left style="padding: 0 4px;"><a href="tvshow.html"><b>The Ninth Wave</b></a></td>
  <td>1</td><td>8</td><td>61</td><td>2019</td>
</tr>
<tr align="middle" bgcolor="#ffffff">
  <td align=left style="padding: 0 4px;"><a href="tvshow-4214-0.html"><b>Glasshouse</b></a></td>
</tr>
${indexRow({ rank: 5, id: 4218, name: "Saltmarsh &#x27;91 &nosuch; &#8212;", seasons: 1, episodes: "n/a", subtitles: "", year: "unknown" })}
</table>`,
);

/** A footer naming only some of its four counters. */
const showsIndexPartialFooter = showsIndex.replace(
  FOOTER,
  `<div id="footer">TV Shows: 2818 Downloads: 523 807 767</div>`,
);

/**
 * A season page written in ways the site's own shapes leave room for: a row
 * whose code carries no episode number, an amount that is not a number, a flag
 * drawn for a code no language table holds, and a flag with no alt at all.
 */
const seasonOdd = seasonPage("Harbour Lights", 3, seasonList(4210, [1, 2, 3], 3), [
  `<tr align="middle" bgcolor="#ffffff">
  <td>special</td>
  <td align=left style="padding: 0 4px;"><a href="episode-52130.html"><b>The Harbour At Night</b></a></td>
  <td>1</td>
  <td><nobr><a href="subtitle-880450.html"><img src="images/flags/en.gif" width="18" height="12" alt="en" border=0></a></nobr></td>
</tr>`,
  `<tr align="middle" bgcolor="#ffffff">
  <td>3x11</td>
  <td align=left style="padding: 0 4px;"><a href="episode-52131.html"><b>Spring Tide</b></a></td>
  <td>many</td>
  <td><nobr>
    <a href="episode-52131-zz.html"><img src="images/flags/zz.gif" width="18" height="12" alt="zz" border=0></a>&nbsp;
    <a href="subtitle-880451.html"><img src="images/flags/en.gif" width="18" height="12" border=0></a>&nbsp;
    <a href="tvshow-4210-3.html"><img src="images/flags/fr.gif" width="18" height="12" alt="fr" border=0></a>
  </nobr></td>
</tr>`,
]);

/** A season page carrying no paragraph of season links at all. */
const seasonNoList = seasonPage("Harbour Lights", 3, "", [
  seasonRow("3x07", 52_118, "The Long Way Round", 5, [
    { kind: "one", code: "en", target: 880_431 },
  ]),
]);

/**
 * An episode page whose blocks were written short: no rating counters, a
 * heading with no release in brackets, a link carrying no id, and cells the
 * site left empty.
 */
const episodeOdd = page(
  "TVsubtitles.net - Subtitles for Harbour Lights 3x07",
  `<b>Harbour Lights 3x07</b>&nbsp; <b>The Long Way Round</b> (Season 3 Episode 7)
<b>Subtitles for this episode:</b>
<a href="/subtitle-880460.html"><div title="Download english subtitles" class="subtitlen">
  <h5 style="width:600px;"><img src="images/flags/en.gif" width="18" height="12" alt="" border=0 hspace=4 align=absmiddle>Harbour Lights 3x07</h5>
${cell("rip", "rip.gif", null, 110)}
${cell("release", "release.gif", null, 110)}
${cell("uploaded", "time.png", null, 70)}
${cell("author", "user.png", null, 120)}
${cell("downloaded", "downloads.png", null, 100)}
</div></a>
<a href="/subtitle.html"><div title="Download french subtitles" class="subtitlen">
  <h5 style="width:600px;"><img src="images/flags/fr.gif" width="18" height="12" alt="" border=0 hspace=4 align=absmiddle>Harbour Lights 3x07 (HDTV.LOL)</h5>
${cell("downloaded", "downloads.png", "not a number", 100)}
</div></a>
<div class="subtitlen"><h5>A block wrapped in no link at all</h5></div>`,
);

/** A record whose labels the site wrote in another order, with two left empty. */
const subtitleOdd = subtitlePage({
  id: 880_470,
  title: "TVsubtitles.net - Download subtitles",
  fields: [
    ["number of downloads", "not a number"],
    ["uploaded", ""],
    ["episode number", "Season 3 episode 7"],
    ["episode title", "The Long Way Round"],
    ["size", ""],
    ["filename", "Harbour Lights - 3x07.srt"],
  ],
});

/** A record whose episode the site spelled out rather than numbered. */
const subtitleWordyNumber = subtitlePage({
  id: 880_471,
  title: RECORD_TITLE,
  fields: [
    ["episode title", "The Long Way Round"],
    ["episode number", "Season three episode seven"],
    ["filename", "Harbour Lights - 3x07.srt"],
    ["size", "21.4 kb"],
    ["uploaded", "04.02.14 09:12:30"],
    ["number of downloads", "318"],
  ],
});

/**
 * A record whose title names no language, where the site usually writes one.
 * Nothing on the page says which language the file is in.
 */
const subtitleNoLanguage = subtitlePage({
  id: 880_472,
  title:
    'TVsubtitles.net - Download subtitles for Harbour Lights 3x07 (season 3 episode 07 - "The Long Way Round")',
  fields: [
    ["episode title", "The Long Way Round"],
    ["episode number", "Season 3 episode 7"],
    ["rip", "HDTV"],
    ["release", "LOL"],
    ["filename", "Harbour Lights - 3x07 - The Long Way Round.srt"],
    ["size", "21.4 kb"],
    ["uploaded", "04.02.14 09:12:30"],
    ["number of downloads", "318"],
  ],
});

/** A record the site published with no rating counters beside it. */
const subtitleNoRating = page(
  RECORD_TITLE,
  `${pair("episode title", "The Long Way Round")}
${pair("episode number", "Season 3 episode 7")}
${pair("rip", "HDTV")}
${pair("release", "LOL")}
${pair("filename", "Harbour Lights - 3x07 - The Long Way Round.HDTV.LOL.en.srt")}
${pair("size", "21.4 kb")}
${pair("uploaded", "04.02.14 09:12:30")}
${pair("number of downloads", "318")}
<a href="download-880431.html">Download</a>`,
);

/** A record carrying a comment far longer than any answer will print whole. */
const subtitleLongComment = subtitlePage({
  id: 880_480,
  title: RECORD_TITLE,
  fields: [
    ["episode title", `The Long Way Round ${"and back again ".repeat(40)}`],
    ["episode number", "Season 3 episode 7"],
    ["rip", "HDTV"],
    ["release", "LOL"],
    ["comment", `The harbour scene runs long. ${"Timings were nudged by a frame. ".repeat(60)}`],
    ["author", "rivermouth"],
    ["filename", "Harbour Lights - 3x07 - The Long Way Round.HDTV.LOL.en.srt"],
    ["size", "21.4 kb"],
    ["uploaded", "04.02.14 09:12:30"],
    ["number of downloads", "318"],
  ],
});

/** Where the site sends a reader who asks for a subtitle id it does not hold. */
const frontPage = page(
  "TVsubtitles.net - TV Subtitles",
  `<p class="description">Latest subtitles</p>
<a href="tvshows.html">Browse the shows</a>`,
);

/** A page in no shape any parser here reads. */
const unreadable =
  "<!DOCTYPE html><html><body><p>Service temporarily unavailable</p></body></html>\n";

const files = {
  "shows-index.html": showsIndex,
  "shows-index-no-footer.html": showsIndexNoFooter,
  "season-broken-row.html": seasonBrokenRow,
  "search-matches.html": searchMatches,
  "search-empty.html": searchEmpty,
  "season-full.html": seasonFull,
  "season-unknown-show.html": seasonUnknownShow,
  "season-past-last.html": seasonPastLast,
  "season-empty-coverage.html": seasonEmptyCoverage,
  "episode-one-language.html": episodeOneLanguage,
  "episode-many-languages.html": episodeManyLanguages,
  "episode-language-french.html": episodeLanguageFrench,
  "episode-language-empty.html": episodeLanguageEmpty,
  "episode-slack-water-english.html": episodeSlackWaterEnglish,
  "episode-slack-water-empty.html": episodeSlackWaterEmpty,
  "episode-unknown.html": episodeUnknown,
  "subtitle-full.html": subtitleFull,
  "subtitle-no-author.html": subtitleNoAuthor,
  "subtitle-no-release.html": subtitleNoRelease,
  "subtitle-comment.html": subtitleComment,
  "subtitle-comment-forging.html": subtitleCommentForging,
  "subtitle-bad-stamp.html": subtitleBadStamp,
  "subtitle-impossible-day.html": subtitleImpossibleDay,
  "shows-index-odd.html": showsIndexOdd,
  "shows-index-partial-footer.html": showsIndexPartialFooter,
  "season-odd.html": seasonOdd,
  "season-no-list.html": seasonNoList,
  "episode-odd.html": episodeOdd,
  "subtitle-odd.html": subtitleOdd,
  "subtitle-wordy-number.html": subtitleWordyNumber,
  "subtitle-no-language.html": subtitleNoLanguage,
  "subtitle-no-rating.html": subtitleNoRating,
  "subtitle-long-comment.html": subtitleLongComment,
  "front-page.html": frontPage,
  "unreadable.html": unreadable,
};

for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(out, name), body, "utf8");
}

process.stdout.write(`wrote ${Object.keys(files).length} fixtures to ${out}\n`);
