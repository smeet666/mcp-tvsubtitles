# What tvsubtitles.net publishes

Measured on 2026-08-31 over the show index, 50 show pages, 8 episode pages and
50 subtitle pages, sampled across four bands of catalogue size. Catalogue pages
only: no subtitle file was fetched, and none ever is.

## Addresses

| Page                    | Address                         | What it holds               |
| ----------------------- | ------------------------------- | --------------------------- |
| Show index              | `/tvshows.html`                 | Every show, one row each    |
| Show season             | `/tvshow-<id>-<season>.html`    | One season's episodes       |
| Episode                 | `/episode-<id>.html`            | One episode, every language |
| Episode in one language | `/episode-<id>-<lang>.html`     | One episode, one language   |
| Subtitle                | `/subtitle-<id>.html`           | One subtitle's record       |
| Recent                  | `/new.html`                     | The 50 latest records       |
| Search                  | `POST /search1.php`, field `qs` | Matching shows              |

**`season` 0 serves the newest season rather than an overview.** The page states
which season it served, and the server reports that number rather than the one
asked for.

## Site totals, printed in the footer of every page

`Total subtitles`, `TV Shows`, `TV Episodes` and `Downloads`. These count the
whole site and answer no search, so they are reported under their own names and
never as the total of a result set.

## The show index

Columns: rank, name, seasons, episodes, subtitles, year.

- 2818 rows, of which **80 are SQL injection payloads stored as show names**.
  They were submitted through the site's own add form and the site serves them.
  A row whose name matches an attack shape is dropped before rendering, and the
  count of dropped rows travels in `skipped`.
- `year` is a single year or a range of two, and both forms occur about equally
  often. It is kept as published rather than reduced to a start year.
- `episodes` is empty on 19 rows and `subtitles` on 33. Empty means the site
  printed nothing, so the field is `null`.

## A season page

An episode table of code, title, amount, and one flag per language.

**The flag links to one of two places.** A language holding one subtitle links
straight to `/subtitle-<id>.html`. A language holding several links to
`/episode-<id>-<lang>.html`. A parser that assumes either shape alone loses
half the catalogue.

An empty slot is drawn as a blank image with no link, which means the language
holds nothing for that episode.

## A subtitle record

Ten labelled fields. Presence measured over 50 records:

| Field                 | Present | Note                                       |
| --------------------- | ------- | ------------------------------------------ |
| `episode title`       | 50/50   |                                            |
| `episode number`      | 50/50   | Written `Season N episode N`               |
| `rip`                 | 43/50   | `HDTV` 34, `WEB` 7, `DVDRip` 1, `BluRay` 1 |
| `release`             | 41/50   | The release group                          |
| `comment`             | 7/50    | Free text from the uploader                |
| `author`              | 17/50   | Absent on two records out of three         |
| `filename`            | 50/50   |                                            |
| `size`                | 50/50   | Always stated in kb                        |
| `uploaded`            | 50/50   | `DD.MM.YY HH:MM:SS`, no timezone           |
| `number of downloads` | 50/50   |                                            |

Two rating counters sit beside the record. `bad` was 0 on all 50 and `good` was
above 0 on 2, so the counters are published and barely used. They are reported as
the site prints them.

**`release` keeps the case the uploader typed.** The same group appears as `LOL`
and as `lol`, as `FQM` and as `fqm`. Folding the case would rewrite the one token
a caller uses to match a subtitle to a video file.

**The filename repeats what the labelled fields already state**, on 42 of the 43
records carrying a `rip`. The labelled fields are the source, and the filename is
carried as published without being parsed for a version.

Only 4 records out of 50 carry neither `rip` nor `release`, and their filenames
carry no version either. Those are the records whose `release_match` is `none`.

## Languages

The site draws 24 flags and addresses each language by a two-letter code of its
own. Six of them differ from ISO 639-1:

| Site code | Language             | ISO 639-1 |
| --------- | -------------------- | --------- |
| `gr`      | Greek                | `el`      |
| `cz`      | Czech                | `cs`      |
| `jp`      | Japanese             | `ja`      |
| `cn`      | Chinese              | `zh`      |
| `ua`      | Ukrainian            | `uk`      |
| `br`      | Brazilian Portuguese | `pt-BR`   |

**`br` is the dangerous one.** It is a valid ISO code for Breton, so a blind
mapping renames a Brazilian Portuguese subtitle into a Breton one. The site's
code travels verbatim in `language`, and `language_code` is filled from a table
written by hand for these 24 codes, holding `null` where the mapping is not
certain.

The filename ends in the same site code, and it agreed with the language named on
the page on all 50 records.

## The file itself is gated, on purpose

`/download-<id>.html` serves no file. It serves a small page holding a countdown
and the file's address split across several variables, joined at run time by the
browser. A reader that does not execute the page's script finds no link in it.

Splitting an address into fragments is a measure taken against automated
readers, and waiting out a countdown is a limit taken against them too.
Reassembling the one or sitting through the other would be a circumvention, so
this server does neither and offers no tool that would need to.

This is why every answer ends at `page_url`, and why the download route is never
called. It is also why no tool can report what a subtitle file contains, how
many lines it holds or what span it covers: reaching the file at all is what the
site declines.

## Fields this site does not publish

`imdb_id`, `tmdb_id`, `machine_translated` and `hearing_impaired` appear nowhere.
They are `null`, and no answer infers them.

Season packs do not exist: every record is one episode. `is_pack` is always
`false` and `files_in_pack` is always `null`, so a subtitle count from this site
counts episodes.
