# mcp-tvsubtitles

[![npm](https://img.shields.io/npm/v/mcp-tvsubtitles.svg)](https://www.npmjs.com/package/mcp-tvsubtitles)
[![CI](https://github.com/smeet666/mcp-tvsubtitles/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-tvsubtitles/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-tvsubtitles.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-tvsubtitles)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-tvsubtitles/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-tvsubtitles)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tvsubtitles&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC10dnN1YnRpdGxlcyJdfQ==)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=tvsubtitles&config=%7B%22name%22%3A%22tvsubtitles%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-tvsubtitles%22%5D%7D)

[TVsubtitles.net](https://www.tvsubtitles.net) catalogues subtitles for
television series. Its readers upload a file for one episode, timed to one video
release, and the site records the language, the release it was cut for, who
uploaded it and when, how large the file is and how often it has been taken. It
holds around three hundred thousand of them, across some eighty-six thousand
episodes in twenty-four languages.

This server connects a chat client to that catalogue. You can search for a
series, read a season and see which languages hold something for each episode,
read the records of one episode, and open one record with the release it was cut
for and who uploaded it. Every record carries the address of its page on the
site. No API key and no account are needed.

_[Version française](#mcp-tvsubtitles-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tvsubtitles&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC10dnN1YnRpdGxlcyJdfQ==)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=tvsubtitles&config=%7B%22name%22%3A%22tvsubtitles%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-tvsubtitles%22%5D%7D)

**Claude Code**

```bash
claude mcp add tvsubtitles -- npx -y mcp-tvsubtitles
```

**Any client reading `mcpServers`**

```json
{
  "mcpServers": {
    "tvsubtitles": {
      "command": "npx",
      "args": ["-y", "mcp-tvsubtitles"]
    }
  }
}
```

### With Docker

```json
{
  "mcpServers": {
    "tvsubtitles": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/smeet666/mcp-tvsubtitles:0.3.0"]
    }
  }
}
```

The container reaches `https://www.tvsubtitles.net` and nothing else.

### Bundle, without npm

Download `mcp-tvsubtitles.mcpb` from the
[latest release](https://github.com/smeet666/mcp-tvsubtitles/releases/latest) and
open it with a host that installs MCP bundles. It carries its dependencies, so
Node 24 or later is all it needs.

## What you can ask

- "Does tvsubtitles have French subtitles for Smallville?"
- "Which languages cover season 3 of Harbour Lights?"
- "List the English subtitles for episode 7 of that season."
- "Which release is that subtitle timed to, and who uploaded it?"
- "Find me the page to download the Polish subtitle for the finale."

## Tools

| Tool             | What it does                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| `search_titles`  | Finds a television series by name, and returns the id the others take.  |
| `list_subtitles` | Reads a season's coverage, or one episode's subtitle records.           |
| `get_subtitle`   | Reads one record, with its release, its uploader and its download page. |
| `list_languages` | Lists the languages the catalogue holds, or the ones one show holds.    |

### `search_titles`

Searches the catalogue by name. The site catalogues television only, so a search
for a film is refused rather than answered.

| Argument      | Type                       | Required | What it does                                                                                                       |
| ------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `query`       | string, 1–120 characters   | yes      | The name of a series, or part of one.                                                                              |
| `media_type`  | `movie` \| `tv` \| `any`   | no       | `tv` and `any` search the catalogue. `movie` is refused.                                                           |
| `year`        | integer, 1900–2100         | no       | Keeps rows whose published years cover this one.                                                                   |
| `limit`       | integer, 1–100, default 20 | no       | Rows to render.                                                                                                    |
| `with_counts` | boolean, default false     | no       | Reads each row's subtitle, episode and season counts from the catalogue index, at the cost of one further request. |

**In return:** the matching series, each with the `id` the other tools take, the
years the site publishes, and the languages it draws a flag for. `imdb_id` and
`tmdb_id` are null, because the site's search publishes none. `subtitle_count`,
`episode_count` and `season_count` are null unless `with_counts` asks for them,
since the site publishes those three on its catalogue index rather than on the
page a search answers with; each counts every season of the show together, which
`counts_scope` names, each is read on its own, and a show the index carries no
row for keeps three nulls. `total_available` counts the rows this one search came
back with, which `total_counts` names. A year that leaves nothing is set aside
and named in `filters_dropped`.

### `list_subtitles`

Reads what a series holds, in one of two shapes that `kind` names.

| Argument   | Type                       | Required | What it does                                                        |
| ---------- | -------------------------- | -------- | ------------------------------------------------------------------- |
| `id`       | string, 1–12 characters    | yes      | A show id from `search_titles`.                                     |
| `season`   | integer, 1–200             | no       | Left out, the newest season the site holds is read.                 |
| `episode`  | integer, 1–500             | no       | Named, the answer is that episode's records.                        |
| `language` | string, 1–40 characters    | no       | A language from `list_languages`, by name, site code or BCP 47 tag. |
| `limit`    | integer, 1–200, default 40 | no       | Rows to render.                                                     |

**In return:** with a season alone, `kind` reads `coverage` and each row is one
episode, carrying `episode_id`, the number of subtitles the site counts and the
languages holding something. With an episode named, `kind` reads `subtitles` and
each row is a record carrying the `id` that `get_subtitle` takes. `season` is the
season the site served and `season_requested` the one that was asked for, which
differ when the newest was read. `seasons_available` lists the seasons the show
holds. A language holding nothing is set aside, the answer comes back
unnarrowed, and `filters_dropped` names it.

### `get_subtitle`

Reads one record from an id `list_subtitles` returned.

| Argument | Type                    | Required | What it does                         |
| -------- | ----------------------- | -------- | ------------------------------------ |
| `id`     | string, 1–12 characters | yes      | A subtitle id from `list_subtitles`. |

**In return:** the record, with `page_url` for the page a reader opens to
download the file. `read_from` reads `record` here and `listing` on a row
`list_subtitles` produced, which is what tells an unread field from one the site
does not publish: a listing carries no `file_name`, no `size_text` and no
`comment`, because the site prints those on a record's own page alone. `releases` holds the video releases the site published and
`release_match` says whether it published any: `stated` where it did, `none`
where it did not, so a record marked `none` says nothing about which video it is
timed to. `uploader` is null on roughly two records out of three. `published_at`
is the site's stamp read into ISO 8601 and carries no timezone, and
`published_text` keeps the site's own wording. `rating` holds two counters the
site publishes, where a zero is a figure it printed.

### `list_languages`

Lists the languages the site catalogues, or the ones one show holds.

| Argument | Type                    | Required | What it does                                               |
| -------- | ----------------------- | -------- | ---------------------------------------------------------- |
| `id`     | string, 1–12 characters | no       | A show id, to read what that show holds.                   |
| `season` | integer, 1–200          | no       | Which season to measure a show over. Ignored without `id`. |

**In return:** each language with the name the site prints, the two-letter
`site_code` it addresses the language by, the BCP 47 `code` where that mapping is
certain, and `differs_from_iso`. `scope` says what was measured: `catalogue` for
the whole site, or `season` when a show id was passed, and `count` is then the
episodes of that season holding the language.

## Languages, and the codes the site uses

The site draws twenty-four flags and addresses each language by two letters of
its own choosing. Six of them differ from ISO 639-1, and one collides: the site
writes `br` for Brazilian Portuguese, which ISO assigns to Breton.

| Site code | Language             | BCP 47  |
| --------- | -------------------- | ------- |
| `br`      | Brazilian Portuguese | `pt-BR` |
| `gr`      | Greek                | `el`    |
| `cz`      | Czech                | `cs`    |
| `jp`      | Japanese             | `ja`    |
| `cn`      | Chinese              | `zh`    |
| `ua`      | Ukrainian            | `uk`    |

`language` keeps the site's own name and `language_code` carries the tag, so
nothing has to be derived from the two letters. `list_subtitles` accepts a
language written any of the three ways.

## Configuration

Nothing has to be set. Every variable below is optional.

| Variable                | Default | Range                              | What it does                                                |
| ----------------------- | ------- | ---------------------------------- | ----------------------------------------------------------- |
| `TVS_USER_AGENT`        | unset   |                                    | Prepended to this server's own agent, which stays attached. |
| `TVS_MIN_INTERVAL_MS`   | 2000    | 1500–60000                         | Milliseconds between two requests. 1500 is a floor.         |
| `TVS_TIMEOUT_MS`        | 20000   | 1000–120000                        | Deadline for one attempt.                                   |
| `TVS_BUDGET_MS`         | 60000   | 5000–600000                        | Deadline for one read, its retries included.                |
| `TVS_MAX_RETRIES`       | 3       | 0–8                                | Attempts after the first.                                   |
| `TVS_CACHE_TTL_MS`      | 900000  | 0–86400000                         | How long a page is held in memory. 0 turns the store off.   |
| `TVS_CACHE_MAX_ENTRIES` | 200     | 1–5000                             | Pages held before the least recently used is dropped.       |
| `TVS_MAX_BODY_BYTES`    | 8000000 | 100000–64000000                    | The largest answer read for one page.                       |
| `TVS_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug` | What reaches stderr.                                        |

A value outside its range is refused on stderr and the default stands.

## Errors

| Code            | What it means                                  | What to do                                            |
| --------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `not_found`     | The site answered, and holds no such thing.    | Check the id came from a listing rather than by hand. |
| `invalid_input` | The arguments could not produce a request.     | Read the message, which names the argument.           |
| `rate_limited`  | The site asked this client to slow down.       | Wait and ask again. The thing asked for still exists. |
| `parse_failure` | An answer arrived in a shape this cannot read. | Report it with the arguments used.                    |
| `network_error` | The request did not complete.                  | Try again.                                            |
| `timeout`       | No answer arrived inside the deadline.         | Try again, or raise `TVS_BUDGET_MS`.                  |

## As a library

The layer that reads the site is published on its own, with the pacing, the
store and the error codes, and no protocol attached.

```ts
import { TvSubtitlesClient } from "mcp-tvsubtitles/client";

const client = new TvSubtitlesClient();
const found = await client.searchShows("Smallville");
const season = await client.getSeason(found.data.rows[0].id, 0);
console.log(season.data.showName, season.data.season, season.data.episodes.length);
```

Every read returns `{ data, cached }`, with `skipped` when rows were left out.
The constructor takes `{ config, logger, fetchImpl }`, and the interval floor
holds whatever is passed.

## Pacing and attribution

One request at a time, two seconds apart, widening when the site pushes back and
narrowing again on a run of clean answers. The floor of 1.5 seconds cannot be
lowered. The agent string carries the project name, its version and the address
of this repository, so the site can reach a person.

Subtitles are the work of the people who wrote and timed them. This server reads
the catalogue and downloads no subtitle file: every record carries `page_url`,
which is the page a reader opens to download it. Credit tvsubtitles.net and link
that page when you show a result.

This MCP server is not affiliated with tvsubtitles.net.

## Privacy

No account, no key, no telemetry. The only host reached is
`https://www.tvsubtitles.net`. Pages are held in memory for fifteen minutes and
nothing is written to disk. Diagnostics go to stderr. See [PRIVACY.md](./PRIVACY.md).

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run coverage
npm run check
```

`npm run test:live` makes one request per route against the site, and runs
nightly.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md)
and [SECURITY.md](./SECURITY.md).

## License

MIT, see [LICENSE](./LICENSE).

---

<a name="mcp-tvsubtitles-français"></a>

# mcp-tvsubtitles (français)

_[English version](#mcp-tvsubtitles)_

[TVsubtitles.net](https://www.tvsubtitles.net) catalogue les sous-titres de
séries télévisées. Ses lecteurs y déposent un fichier pour un épisode, calé sur
une version vidéo, et le site enregistre la langue, la version pour laquelle il a
été taillé, qui l'a déposé et quand, la taille du fichier et le nombre de fois
qu'il a été pris. Il en tient environ trois cent mille, sur quelque quatre-vingt-six
mille épisodes, dans vingt-quatre langues.

Ce serveur relie un client de conversation à ce catalogue. On peut chercher une
série, lire une saison en voyant quelles langues tiennent quelque chose pour
chaque épisode, lire les fiches d'un épisode, et ouvrir une fiche avec la version
pour laquelle elle a été taillée et qui l'a déposée. Chaque fiche porte l'adresse
de sa page sur le site. Aucune clé d'API ni aucun compte ne sont nécessaires.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=tvsubtitles&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC10dnN1YnRpdGxlcyJdfQ==)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=tvsubtitles&config=%7B%22name%22%3A%22tvsubtitles%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-tvsubtitles%22%5D%7D)

**Claude Code**

```bash
claude mcp add tvsubtitles -- npx -y mcp-tvsubtitles
```

**Tout client lisant `mcpServers`**

```json
{
  "mcpServers": {
    "tvsubtitles": {
      "command": "npx",
      "args": ["-y", "mcp-tvsubtitles"]
    }
  }
}
```

### Avec Docker

```json
{
  "mcpServers": {
    "tvsubtitles": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/smeet666/mcp-tvsubtitles:0.3.0"]
    }
  }
}
```

Le conteneur joint `https://www.tvsubtitles.net` et rien d'autre.

### Bundle, sans npm

Télécharger `mcp-tvsubtitles.mcpb` depuis la
[dernière publication](https://github.com/smeet666/mcp-tvsubtitles/releases/latest)
et l'ouvrir avec un hôte qui installe les bundles MCP. Il emporte ses
dépendances, donc Node 24 ou plus récent suffit.

## Ce qu'on peut demander

- « Est-ce que tvsubtitles a des sous-titres français pour Smallville ? »
- « Quelles langues couvrent la saison 3 de Harbour Lights ? »
- « Liste les sous-titres anglais de l'épisode 7 de cette saison. »
- « Sur quelle version ce sous-titre est-il calé, et qui l'a déposé ? »
- « Trouve-moi la page pour télécharger le sous-titre polonais du dernier épisode. »

## Les outils

| Outil            | Ce qu'il fait                                                              |
| ---------------- | -------------------------------------------------------------------------- |
| `search_titles`  | Trouve une série par son nom et rend l'id que les autres prennent.         |
| `list_subtitles` | Lit la couverture d'une saison, ou les fiches d'un épisode.                |
| `get_subtitle`   | Lit une fiche, avec sa version, son déposant et sa page de téléchargement. |
| `list_languages` | Liste les langues du catalogue, ou celles que tient une série.             |

### `search_titles`

Cherche dans le catalogue par le nom. Le site ne catalogue que la télévision,
donc une recherche de film est refusée au lieu d'être répondue.

| Argument      | Type                       | Requis | Ce qu'il fait                                                                                                                      |
| ------------- | -------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `query`       | chaîne, 1 à 120 caractères | oui    | Le nom d'une série, ou une partie.                                                                                                 |
| `media_type`  | `movie` \| `tv` \| `any`   | non    | `tv` et `any` cherchent dans le catalogue. `movie` est refusé.                                                                     |
| `year`        | entier, 1900 à 2100        | non    | Garde les lignes dont les années publiées couvrent celle-ci.                                                                       |
| `limit`       | entier, 1 à 100, défaut 20 | non    | Lignes à rendre.                                                                                                                   |
| `with_counts` | booléen, défaut faux       | non    | Lit les comptes de sous-titres, d'épisodes et de saisons de chaque ligne dans l'index du catalogue, au prix d'une requête de plus. |

**En retour :** les séries trouvées, chacune avec l'`id` que prennent les autres
outils, les années publiées par le site et les langues pour lesquelles il dessine
un drapeau. `imdb_id` et `tmdb_id` valent null, puisque la recherche du site n'en
publie aucun. `subtitle_count`, `episode_count` et `season_count` valent null
tant que `with_counts` ne les demande pas, car le site publie ces trois chiffres
sur l'index de son catalogue et non sur la page qui répond à une recherche ;
chacun compte toutes les saisons de la série ensemble, ce que `counts_scope`
nomme, chacun se lit à part, et une série dont l'index ne porte aucune ligne
garde trois null. `total_available` compte les lignes que cette recherche a
ramenées, ce que `total_counts` nomme. Une année qui ne laisse rien est mise de
côté et nommée dans `filters_dropped`.

### `list_subtitles`

Lit ce qu'une série tient, sous l'une de deux formes que `kind` nomme.

| Argument   | Type                       | Requis | Ce qu'il fait                                                            |
| ---------- | -------------------------- | ------ | ------------------------------------------------------------------------ |
| `id`       | chaîne, 1 à 12 caractères  | oui    | Un id de série venu de `search_titles`.                                  |
| `season`   | entier, 1 à 200            | non    | Omis, la saison la plus récente est lue.                                 |
| `episode`  | entier, 1 à 500            | non    | Nommé, la réponse porte les fiches de cet épisode.                       |
| `language` | chaîne, 1 à 40 caractères  | non    | Une langue de `list_languages`, par son nom, son code ou son tag BCP 47. |
| `limit`    | entier, 1 à 200, défaut 40 | non    | Lignes à rendre.                                                         |

**En retour :** avec une saison seule, `kind` vaut `coverage` et chaque ligne est
un épisode, portant `episode_id`, le nombre de sous-titres que le site compte et
les langues qui tiennent quelque chose. Avec un épisode nommé, `kind` vaut
`subtitles` et chaque ligne est une fiche portant l'`id` que prend
`get_subtitle`. `season` est la saison servie par le site et `season_requested`
celle demandée, les deux différant quand la plus récente a été lue.
`seasons_available` liste les saisons que la série tient. Une langue qui ne tient
rien est mise de côté, la réponse revient sans la restriction, et
`filters_dropped` la nomme.

### `get_subtitle`

Lit une fiche depuis un id rendu par `list_subtitles`.

| Argument | Type                      | Requis | Ce qu'il fait                                 |
| -------- | ------------------------- | ------ | --------------------------------------------- |
| `id`     | chaîne, 1 à 12 caractères | oui    | Un id de sous-titre venu de `list_subtitles`. |

**En retour :** la fiche, avec `page_url` pour la page qu'un lecteur ouvre afin
de télécharger le fichier. `read_from` vaut ici `record`, et `listing` sur une
ligne venue de `list_subtitles` : c'est ce qui distingue un champ non lu d'un
champ que le site ne publie pas, car une liste ne porte ni `file_name`, ni
`size_text`, ni `comment`, que le site n'imprime que sur la page d'une fiche. `releases` porte les versions vidéo publiées par le
site et `release_match` dit s'il en a publié une : `stated` quand oui, `none`
quand non, donc une fiche marquée `none` ne dit rien de la vidéo sur laquelle
elle est calée. `uploader` vaut null sur environ deux fiches sur trois.
`published_at` est l'horodatage du site lu en ISO 8601 et ne porte aucun fuseau,
et `published_text` garde la formulation du site. `rating` porte deux compteurs
que le site publie, où un zéro est un chiffre qu'il a imprimé.

### `list_languages`

Liste les langues que le site catalogue, ou celles que tient une série.

| Argument | Type                      | Requis | Ce qu'il fait                                       |
| -------- | ------------------------- | ------ | --------------------------------------------------- |
| `id`     | chaîne, 1 à 12 caractères | non    | Un id de série, pour lire ce que cette série tient. |
| `season` | entier, 1 à 200           | non    | Sur quelle saison mesurer. Ignoré sans `id`.        |

**En retour :** chaque langue avec le nom que le site imprime, le `site_code` de
deux lettres par lequel il l'adresse, le `code` BCP 47 quand la correspondance
est certaine, et `differs_from_iso`. `scope` dit ce qui a été mesuré :
`catalogue` pour le site entier, ou `season` quand un id de série a été passé, et
`count` vaut alors les épisodes de cette saison qui tiennent la langue.

## Les langues, et les codes du site

Le site dessine vingt-quatre drapeaux et adresse chaque langue par deux lettres
de son choix. Six diffèrent de l'ISO 639-1, et l'une entre en collision : le site
écrit `br` pour le portugais brésilien, que l'ISO attribue au breton.

| Code du site | Langue              | BCP 47  |
| ------------ | ------------------- | ------- |
| `br`         | Portugais brésilien | `pt-BR` |
| `gr`         | Grec                | `el`    |
| `cz`         | Tchèque             | `cs`    |
| `jp`         | Japonais            | `ja`    |
| `cn`         | Chinois             | `zh`    |
| `ua`         | Ukrainien           | `uk`    |

`language` garde le nom du site et `language_code` porte le tag, donc rien n'est
à déduire des deux lettres. `list_subtitles` accepte une langue écrite de l'une
des trois façons.

## Configuration

Rien n'est à régler. Toutes les variables ci-dessous sont optionnelles.

| Variable                | Défaut  | Bornes                             | Ce qu'elle fait                                                 |
| ----------------------- | ------- | ---------------------------------- | --------------------------------------------------------------- |
| `TVS_USER_AGENT`        | absent  |                                    | Placé devant l'agent du serveur, qui reste attaché.             |
| `TVS_MIN_INTERVAL_MS`   | 2000    | 1500 à 60000                       | Millisecondes entre deux requêtes. 1500 est un plancher.        |
| `TVS_TIMEOUT_MS`        | 20000   | 1000 à 120000                      | Délai d'une tentative.                                          |
| `TVS_BUDGET_MS`         | 60000   | 5000 à 600000                      | Délai d'une lecture, reprises comprises.                        |
| `TVS_MAX_RETRIES`       | 3       | 0 à 8                              | Tentatives après la première.                                   |
| `TVS_CACHE_TTL_MS`      | 900000  | 0 à 86400000                       | Durée de conservation d'une page en mémoire. 0 éteint le cache. |
| `TVS_CACHE_MAX_ENTRIES` | 200     | 1 à 5000                           | Pages gardées avant que la plus ancienne parte.                 |
| `TVS_MAX_BODY_BYTES`    | 8000000 | 100000 à 64000000                  | Plus grande réponse lue pour une page.                          |
| `TVS_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug` | Ce qui atteint stderr.                                          |

Une valeur hors bornes est refusée sur stderr et le défaut s'applique.

## Erreurs

| Code            | Ce que ça veut dire                               | Quoi faire                                                     |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `not_found`     | Le site a répondu et ne tient pas cette chose.    | Vérifier que l'id vient d'une liste et non d'une construction. |
| `invalid_input` | Les arguments ne peuvent pas produire de requête. | Lire le message, qui nomme l'argument.                         |
| `rate_limited`  | Le site demande à ce client de ralentir.          | Attendre et redemander. La chose demandée existe toujours.     |
| `parse_failure` | Une réponse est arrivée dans une forme illisible. | Le signaler avec les arguments employés.                       |
| `network_error` | La requête ne s'est pas achevée.                  | Réessayer.                                                     |
| `timeout`       | Aucune réponse dans le délai.                     | Réessayer, ou élargir `TVS_BUDGET_MS`.                         |

## Comme bibliothèque

La couche qui lit le site est publiée seule, avec son rythme, son cache et ses
codes d'erreur, sans protocole attaché.

```ts
import { TvSubtitlesClient } from "mcp-tvsubtitles/client";

const client = new TvSubtitlesClient();
const found = await client.searchShows("Smallville");
const season = await client.getSeason(found.data.rows[0].id, 0);
console.log(season.data.showName, season.data.season, season.data.episodes.length);
```

Toute lecture rend `{ data, cached }`, avec `skipped` quand des lignes ont été
écartées. Le constructeur prend `{ config, logger, fetchImpl }`, et le plancher
d'intervalle tient quoi qu'on lui passe.

## Rythme et attribution

Une requête à la fois, deux secondes d'écart, élargi quand le site repousse et
resserré après une série de réponses propres. Le plancher d'une seconde et demie
ne peut pas être abaissé. La chaîne d'agent porte le nom du projet, sa version et
l'adresse de ce dépôt, pour que le site puisse joindre une personne.

Les sous-titres sont l'œuvre de ceux qui les ont écrits et calés. Ce serveur lit
le catalogue et ne télécharge aucun fichier de sous-titres : chaque fiche porte
`page_url`, la page qu'un lecteur ouvre pour le télécharger. Créditer
tvsubtitles.net et lier cette page en montrant un résultat.

Ce serveur MCP n'est pas affilié à tvsubtitles.net.

## Confidentialité

Aucun compte, aucune clé, aucune télémétrie. Le seul hôte joint est
`https://www.tvsubtitles.net`. Les pages sont gardées quinze minutes en mémoire
et rien n'est écrit sur le disque. Les diagnostics vont sur stderr. Voir
[PRIVACY.md](./PRIVACY.md).

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run coverage
npm run check
```

`npm run test:live` fait une requête par route contre le site, et tourne chaque
nuit.

## Contribuer

Les issues et les pull requests sont bienvenues. Voir
[CONTRIBUTING.md](./CONTRIBUTING.md) et [SECURITY.md](./SECURITY.md).

## Licence

MIT, voir [LICENSE](./LICENSE).
