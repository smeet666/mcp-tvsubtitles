# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-09-01

### Fixed

- A narrowing that fails is set aside like one that comes back empty. The
  site keeps a page per language beside an episode's own page, and when that
  page could not be read the whole answer was lost, reporting an episode that
  exists and holds subtitles as absent.
- No row of another language is rendered under a filter naming this one. The
  page for a language is trusted for the rows it holds rather than for the
  question it was given, so `filters_applied` cannot name a language its own
  payload contradicts.
- A season answer and a language answer report the rows they could not read.
  The client counted them on every route and only the search said so, which
  left a total of episodes counting the readable ones while reading as though
  it counted them all.
- A search answer counts the entries the site did not finish writing, as an
  index answer does. They disappeared without a word, under a note written to
  name them.
- Asking for the catalogue counts no longer takes a successful search down
  with it. The counts are an addition to an answer the site had already given,
  so failing to read the index costs the counts alone and the answer says so.
- A refusal carries the same two defences an answer does. It quotes a line
  shaped like one this server writes and takes out the characters that reverse
  a line's direction, both of which reach it through a show's name.
- The arabic letter mark is taken out of the rendered block with the other
  direction controls. Unicode counts nine and eight were being removed.
- A season page this server cannot read comes back as `parse_failure`. The site
  heads every season page with its episode table, the page for a season past
  the last one included, so a page without it was being reported as a season
  the site published empty.
- A language a caller named is resolved before anything is read, so a language
  this site does not hold is refused without costing the site a request.
- A refusal written by a tool names the argument it is about, as a refusal from
  the schema does.
- `total_available` counts the rows the site's answer held, before a filter
  narrowed them, which is what its name and its description say.
- An answer that needed the catalogue index reports itself as cached only when
  both pages came from memory.
- A season named without a show id is said to have been set aside rather than
  dropped in silence.
- A setting outside the range this server keeps is complained about for what
  was wrong with it: a value above the ceiling was being called too low.
- A read that spends its whole budget says so without blaming the site, since
  the budget covers this client's own waits between attempts.
- A text block cut to fit ends on one ellipsis rather than two.

### Removed

- `languageNameOf`, an export of a tool module that no caller could reach.
  The package publishes two entry points, neither of which leads to it.

## [1.0.0] - 2026-09-01

### Changed

- `search_titles` takes `with_counts` where it took `with_subtitle_count`, and
  reads the episode and season counts the catalogue index publishes beside the
  subtitle count. One request over that page now answers three questions rather
  than one. Each row carries `episode_count` and `season_count` beside
  `subtitle_count`, each cell is read on its own, and `counts_scope` replaces
  `subtitle_count_scope`.

### Added

- Every subtitle row carries `read_from`, saying whether it was read from a
  listing or from a record's own page. The site prints the file name, the size
  and the uploader's comment on a record page alone, so a listing row leaves
  those three null. The marker is what tells a field nobody read from one the
  site does not publish.

### Fixed

- A release the site names in both its cells is carried once. The site fills
  the medium and the group with the same word often enough that carrying it
  twice read as two releases where there is one.
- `title_id` names the show a row belongs to, and is null on a row read from a
  record's own page, because that page names no show. It carried the subtitle's
  own id there, which gave one field two meanings depending on the route that
  produced the row and sent a caller who followed it to an absence this server
  invented. The show is named under `show_name`.
- A season's count of rows it could not read leaves out the two rows a season
  table holds that are not episodes: the spacer, and the aggregate the site
  offers so a reader can take a whole season at once. Counting those made
  `skipped` report two unreadable episodes on every season.
- An episode page in a shape this server cannot read comes back as
  `parse_failure`. It came back as `not_found`, which reported the site as
  holding no such episode on the strength of a reading that failed.
- An uploader's comment travels in the structured payload exactly as the site
  published it. A space was being inserted in front of a line opening `Note:` or
  `Source:`, which is a defence the rendered block already carries and which the
  payload is not the place for.
- A language answer names the codes that differ from ISO 639-1 only where its
  own languages carry one, and warns about a show's other seasons only where it
  holds others. It announced none and enumerated nothing, and told a show with
  one season to look through its others.
- What an answer says about a language it narrowed by is decided on the rows it
  renders. The site keeps a page per language beside an episode's own page, and
  where the two disagree the answer claimed an absence while displaying rows in
  that very language.
- The rows an answer left out are reported under their own reasons. A name
  written into the catalogue through the site's add form, a row served with no
  name, and a row too incomplete to read were counted together and all three
  attributed to the first.
- A page naming no season is not enumerated. Two notes printed an empty list
  where the page said nothing.
- Characters that reverse a line's direction are taken out of the rendered
  block. They turn this server's own notes and its credit line around without
  altering a word, which is the forgery the marker lines already guard against
  worked on direction instead of wording. The structured payload keeps what it
  received.
- Settings handed over already resolved are not read from the environment a
  second time, so a refused variable is complained about once.
- A refusal on an address the site holds nothing at names that address.

## [0.2.0] - 2026-09-01

### Added

- `search_titles` takes `with_subtitle_count`, which reads each row's subtitle
  count from the site's catalogue index. The site publishes that figure there
  rather than on the page a search answers with, so it costs one further request
  over a large page and is asked for rather than always read. The figure counts
  every season of a show together, which `subtitle_count_scope` names, and a
  show the index carries no row for keeps a null.

## [0.1.0] - 2026-09-01

First release.

### Added

- `search_titles`, to find a television series by name and get the id the other
  tools take.
- `list_subtitles`, answering a season's coverage or one episode's subtitle
  records, with `kind` naming which.
- `get_subtitle`, reading one record with its release, its uploader and the page
  a reader opens to download the file.
- `list_languages`, publishing the twenty-four languages the catalogue holds, or
  the ones one show holds over a season.
- The client layer published on the `./client` subpath, with its pacing, its
  store and its error codes.

[1.0.1]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v1.0.1
[1.0.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v1.0.0
[0.2.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v0.2.0
[0.1.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v0.1.0
