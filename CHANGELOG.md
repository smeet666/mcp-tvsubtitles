# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/smeet666/mcp-tvsubtitles/releases/tag/v0.1.0
