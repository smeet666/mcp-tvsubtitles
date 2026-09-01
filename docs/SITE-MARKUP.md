# The markup tvsubtitles.net serves

The shape of each page, written with invented shows and invented episodes so
nothing published by the site lives in this repository. The structure below was
read off the live site on 2026-08-31; the words filling it are made up.

Read `SITE-NOTES.md` beside this for what the site publishes and how often each
field is absent. This file says only what the tags look like.

Pages are served as UTF-8 and declare it in a `<meta http-equiv>`.

## The show index, `/tvshows.html`

One table, six columns: rank, name, seasons, episodes, subtitles, year. The name
cell holds the only link, and its address carries season `0`.

```html
<tr align="middle">
  <th bgcolor="#111111" width="5%"><b>#</b></th>
  <th bgcolor="#111111" width="55%"><b>Name</b></th>
  <th bgcolor="#111111" width="5%"><b>Seasons</b></th>
  <th bgcolor="#111111" width="5%"><b>Episodes</b></th>
  <th bgcolor="#111111" width="5%"><b>Subtitles</b></th>
  <th bgcolor="#111111" width="15%"><b>Year</b></th>
</tr>
<tr align="middle" bgcolor="#ffffff">
  <td>1</td>
  <td align="left" style="padding: 0 4px;">
    <a href="tvshow-4210-0.html"><b>Harbour Lights</b></a>
  </td>
  <td>3</td>
  <td>28</td>
  <td>412</td>
  <td>2011-2014</td>
</tr>
```

`Year` is one year or two joined by a hyphen. `Episodes` and `Subtitles` are
empty on some rows, and an empty cell holds nothing at all.

Some rows carry an attack payload where the name goes, written into the
catalogue through the site's own add form. They look like this, and a reader
would not take any of them for a series:

```html
<td align="left" style="padding: 0 4px;">
  <a href="tvshow-4106-0.html"><b>" OR 1=1-- -</b></a>
</td>
<td align="left" style="padding: 0 4px;">
  <a href="tvshow-4151-0.html"><b>' ORDER BY 1000-- -</b></a>
</td>
<td align="left" style="padding: 0 4px;">
  <a href="tvshow-4160-0.html"><b></b></a>
</td>
```

## The search answer, `POST /search1.php` with field `qs`

A list, one item per match. The link carries no season segment, and the years
sit inside the link text after the name. One flag follows per language the show
holds anywhere.

```html
<p class="description">Search results</p>
<p></p>
<ul style="margin-left:2em">
  <li style="font-size: 120%; font-weight:bold; margin:10px 0">
    <div style="">
      <a href="/tvshow-4210.html">Harbour Lights (2011-2014)</a>&nbsp;&nbsp;&nbsp;
      <img
        src="images/flags/en.gif"
        width="18"
        height="12"
        alt="en"
        border="0"
        align="absmiddle"
      />&nbsp;
      <img src="images/flags/fr.gif" width="18" height="12" alt="fr" border="0" align="absmiddle" />
    </div>
  </li>
</ul>
```

A search matching nothing serves the same heading and an empty list.

## A season page, `/tvshow-<id>-<season>.html`

The head titles the page with the show and the season. Season `0` is answered
with a `302` to the newest season's own address.

```html
<title>TVsubtitles.net - Subtitles "Harbour Lights" season 3</title>
```

Every season the show holds is named in one paragraph above the table. **The
season being displayed is printed in bold with no link around it**, and the
others are printed as links, so reading the links alone always loses the season
in hand.

```html
<h2>Harbour Lights</h2>
<p class="description">
  <font color="#3BAE09"><b>Season 3</b></font> | <a href="tvshow-4210-2.html"><b>Season 2</b></a> |
  <a href="tvshow-4210-1.html"><b>Season 1</b></a>
</p>
```

A season the site does not hold is left out of this paragraph even when its own
page is served, which is what tells a season past the last one from one that
exists.

Then a table of four columns: code, episode, amount, subtitles.

```html
<tr align="middle">
  <th bgcolor="#111111" width="8%"><b>#</b></th>
  <th bgcolor="#111111" width="40%"><b>Episode</b></th>
  <th bgcolor="#111111" width="7%"><b>Amount</b></th>
  <th bgcolor="#111111" width="45%"><b>Subtitles</b></th>
</tr>
<tr align="middle" bgcolor="#ffffff">
  <td>3x07</td>
  <td align="left" style="padding: 0 4px;">
    <a href="episode-52118.html"><b>The Long Way Round</b></a>
  </td>
  <td>5</td>
  <td>
    <nobr>
      <a href="episode-52118-en.html"
        ><img src="images/flags/en.gif" width="18" height="12" alt="en" border="0" /></a
      >&nbsp; <img src="images/flags/blank.gif" width="18" height="12" alt="" border="0" />&nbsp;
      <a href="subtitle-880431.html"
        ><img src="images/flags/fr.gif" width="18" height="12" alt="fr" border="0"
      /></a>
    </nobr>
  </td>
</tr>
```

**A flag points to one of two places.** A language holding one subtitle links
straight to `subtitle-<id>.html`. A language holding several links to
`episode-<id>-<lang>.html`. A language holding nothing is drawn as
`blank.gif` with an empty `alt` and no link around it.

### What the site answers instead of a refusal

A show id it does not hold: the same page, `HTTP 200`, with an empty name in the
title and no episode rows.

```html
<title>TVsubtitles.net - Subtitles "" season 1</title>
```

A season past the last one: `HTTP 200`, the real show name, the paragraph
naming the seasons it does hold with the asked-for one absent from it, and no
episode rows.

## An episode page, `/episode-<id>.html` and `/episode-<id>-<lang>.html`

Both serve the same shape. The one with a language holds that language only; the
one without holds every language the episode has.

The body opens with a heading naming the episode:

```html
<b>Harbour Lights 3x07</b>&nbsp; <b>The Long Way Round</b> (Season 3 Episode 7)
<b>Subtitles for this episode:</b>
```

The head of the page repeats the same episode number, so a heading matched
there runs on through the navigation before reaching the brackets that close it.

Each subtitle is one link wrapping a block. The two rating counters are coloured
red and green. The language of the row is named by the flag inside the `h5`, and
the label printed above a group is written in whichever language the site holds
it in, which is often not the language of the files below it.

```html
<a href="/subtitle-880431.html"
  ><div title="Download french subtitles" class="subtitlen">
    <div style="float:right; margin:0 2px;">
      <span style="color:black; font-weight:bold">
        <span style="color:red">0</span>/<span style="color:green">2</span></span
      >
    </div>
    <h5 style="width:600px;">
      <img
        src="images/flags/fr.gif"
        width="18"
        height="12"
        alt=""
        border="0"
        hspace="4"
        align="absmiddle"
      />Harbour Lights 3x07 (WEB.NF)
    </h5>
    <p style="width:110px" alt="rip" title="rip">
      <img
        src="images/rip.gif"
        width="16"
        height="16"
        alt="rip"
        title="rip"
        border="0"
        hspace="4"
        align="absmiddle"
      />
      WEB
    </p>
    <p style="width:110px;" alt="release" title="release">
      <img
        src="images/release.gif"
        width="16"
        height="16"
        alt="release"
        title="release"
        border="0"
        hspace="4"
        align="absmiddle"
      />
      NF
    </p>
    <p style="width:70px;" alt="uploaded" title="uploaded">
      <img
        src="images/time.png"
        width="16"
        height="16"
        alt="uploaded"
        title="uploaded"
        border="0"
        vspace="4"
        hspace="4"
        align="left"
      />
      <small>04.02.14 09:12:30</small>
    </p>
    <p style="width:120px;" alt="author" title="author">
      <nobr
        ><img
          src="images/user.png"
          width="16"
          height="16"
          alt="author"
          title="author"
          border="0"
          hspace="2"
          align="absmiddle"
        />
        <small>rivermouth</small></nobr
      >
    </p>
    <p style="width:100px;" alt="downloaded" title="downloaded">
      <img
        src="images/downloads.png"
        width="16"
        height="16"
        alt="downloaded"
        title="downloaded"
        border="0"
        hspace="4"
        align="absmiddle"
      />
      318
    </p>
  </div></a
>
```

A labelled cell the site printed nothing for still carries its `<p alt="...">`
with the image and nothing after it.

The release the row was cut for is repeated in brackets at the end of the `h5`
text, and some rows carry it there while leaving the `release` cell empty.

An episode id the site does not hold: `HTTP 200`, and the heading comes back
with the numbers missing.

```html
<b>x</b>&nbsp; <b></b> (Season Episode )
```

## A subtitle record, `/subtitle-<id>.html`

The head names the language, the show and the episode.

```html
<title>
  TVsubtitles.net - Download french subtitles for Harbour Lights 3x07 (season 3 episode 07 - "The
  Long Way Round")
</title>
```

The body is a run of labelled pairs, each label in `<b>` and its value in the
`div` that follows. The labels appear in this order, and six of the ten are
absent on some records:

`episode title`, `episode number`, `rip`, `release`, `comment`, `author`,
`filename`, `size`, `uploaded`, `number of downloads`.

```html
<div><b>episode title:</b></div>
<div>The Long Way Round</div>
<div><b>episode number:</b></div>
<div>Season 3 episode 7</div>
<div><b>rip:</b></div>
<div>WEB</div>
<div><b>release:</b></div>
<div>NF</div>
<div><b>author:</b></div>
<div>rivermouth</div>
<div><b>filename:</b></div>
<div>Harbour Lights - 3x07 - The Long Way Round.WEB.NF.fr.srt</div>
<div><b>size:</b></div>
<div>21.4 kb</div>
<div><b>uploaded:</b></div>
<div>04.02.14 09:12:30</div>
<div><b>number of downloads:</b></div>
<div>318</div>
<div>
  <nobr
    ><b><a href="report_bad.php?sid=880431" rel="nofollow">Report bad</a></b></nobr
  >
</div>
```

A label the site has no value for is left out of the run entirely.

The two rating counters follow, carrying the ids `hate` and `love`:

```html
<b id="hate" style="color:red; font-size:14px;">0</b>
<b id="love" style="color:green; font-size:14px;">2</b>
```

The download link sits at the end and is never followed by this server:

```html
<a href="download-880431.html">Download</a>
```

A subtitle id the site does not hold is answered with a `302` to `/`, so the
read finishes on the front page.

## The footer, on every page

```html
Total subtitles: 304847 TV Shows: 2818 TV Episodes: 86818 Downloads: 523 807 767
```

The thousands in `Downloads` are grouped with spaces. These count the whole site
and answer no search.

## Language flags

Twenty-four, addressed by a two-letter code the site chose itself:

```
en es fr de br ru ua it gr ar hu pl tr nl pt sv da fi ko cn jp bg cz ro
```

`SITE-NOTES.md` lists the six that differ from ISO 639-1 and the one that
collides with a different language.
