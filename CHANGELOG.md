# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-01

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

[0.3.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v0.3.0
[0.2.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v0.2.0
[0.1.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v0.1.0
