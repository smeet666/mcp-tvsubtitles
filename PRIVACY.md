# Privacy

This server collects nothing about you, and sends nothing to its author.

_[Version française](#confidentialité)_

---

## What this server is

`mcp-tvsubtitles` is a read-only client for
[tvsubtitles.net](https://www.tvsubtitles.net). It runs on your own machine, as
a process your MCP host starts, and it speaks over stdio. It listens on no port.

It needs no API key and no account, so there is no credential for it to hold and
none for it to send.

It reads the site's catalogue and downloads no subtitle file. Every record it
answers with carries the address of the page you open to download it yourself.

## What leaves your machine, and where it goes

**One host is contacted: `www.tvsubtitles.net`.** Nothing else.

| Host                  | What is read there |
| --------------------- | ------------------ |
| `www.tvsubtitles.net` | the site's pages   |

What a request carries:

| What                   | Why it is there                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The question you asked | A series name or an identifier reaches the site as you wrote it.                                                                          |
| A `User-Agent`         | `mcp-tvsubtitles/<version> (+https://github.com/smeet666/mcp-tvsubtitles)`, so the site can reach a person about the traffic it receives. |
| Your IP address        | Sent by your network to any host you contact, as with any web request.                                                                    |

Your requests reach tvsubtitles.net. What is done with them there is governed by
that site's own practices, which this project does not control.

## What is kept, and for how long

**Answers are held in memory only, and only while the server runs.** The cache is
a table in the process: it holds what was read so that reading the same page
twice costs one request instead of two. It holds at most two hundred pages for
fifteen minutes each by default, and closing the server empties it.

**Nothing is written to disk.** The server creates no file, no database and no
log file.

## What is never collected

- No analytics, no telemetry, no usage counter.
- Nothing is sent to the author of this project or to any third party.
- No account, no profile, no identifier is created for you.
- Your questions are not stored, forwarded, or used to train anything.

## Logs

The server writes diagnostics to **stderr**, where your MCP host decides what
becomes of them. `TVS_LOG_LEVEL` governs how much is written and defaults to
`error`. At that setting the lines are failures and counts of rows left out; at
`debug` the addresses fetched are written too. These lines stay on your machine.

## The settings that change any of this

| Variable           | What it changes                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `TVS_USER_AGENT`   | Adds your own identifier in front of this project's, which stays appended so the site can always reach a person. |
| `TVS_CACHE_TTL_MS` | How long an answer is held in memory. `0` turns the cache off.                                                   |
| `TVS_LOG_LEVEL`    | How much is written to stderr.                                                                                   |

## Children

This server is a tool for developers and it is not directed at children.

## Changes

A change to this policy travels in a release, and the changelog names it.

## Contact

Open an issue on
[the repository](https://github.com/smeet666/mcp-tvsubtitles/issues). For
something exploitable, follow [SECURITY.md](./SECURITY.md) instead.

---

<a name="confidentialité"></a>

# Confidentialité

Ce serveur ne collecte rien sur vous, et n'envoie rien à son auteur.

_[English version](#privacy)_

## Ce qu'est ce serveur

`mcp-tvsubtitles` est un client en lecture seule pour
[tvsubtitles.net](https://www.tvsubtitles.net). Il tourne sur votre machine, en
tant que processus lancé par votre hôte MCP, et parle sur stdio. Il n'écoute sur
aucun port.

Il n'a besoin d'aucune clé d'API ni d'aucun compte, donc il ne détient aucun
identifiant et n'en envoie aucun.

Il lit le catalogue du site et ne télécharge aucun fichier de sous-titres. Chaque
fiche qu'il rend porte l'adresse de la page que vous ouvrez pour le télécharger
vous-même.

## Ce qui quitte votre machine, et où cela va

**Un seul hôte est joint : `www.tvsubtitles.net`.** Rien d'autre.

| Hôte                  | Ce qui y est lu   |
| --------------------- | ----------------- |
| `www.tvsubtitles.net` | les pages du site |

Ce que porte une requête :

| Quoi              | Pourquoi c'est là                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| La question posée | Un nom de série ou un identifiant atteint le site tel que vous l'avez écrit.                                                                     |
| Un `User-Agent`   | `mcp-tvsubtitles/<version> (+https://github.com/smeet666/mcp-tvsubtitles)`, pour que le site puisse joindre une personne au sujet de son trafic. |
| Votre adresse IP  | Transmise par votre réseau à tout hôte que vous joignez, comme pour toute requête web.                                                           |

Vos requêtes atteignent tvsubtitles.net. Ce qui en est fait là-bas relève des
pratiques de ce site, que ce projet ne contrôle pas.

## Ce qui est conservé, et combien de temps

**Les réponses ne sont gardées qu'en mémoire, et seulement pendant que le serveur
tourne.** Le cache est une table dans le processus : il garde ce qui a été lu
pour qu'une même page lue deux fois ne coûte qu'une requête. Il tient deux cents
pages au plus, quinze minutes chacune par défaut, et fermer le serveur le vide.

**Rien n'est écrit sur le disque.** Le serveur ne crée aucun fichier, aucune base
et aucun journal.

## Ce qui n'est jamais collecté

- Aucune analyse d'audience, aucune télémétrie, aucun compteur d'usage.
- Rien n'est envoyé à l'auteur de ce projet ni à un tiers.
- Aucun compte, aucun profil, aucun identifiant n'est créé pour vous.
- Vos questions ne sont ni stockées, ni transmises, ni utilisées pour entraîner
  quoi que ce soit.

## Les journaux

Le serveur écrit ses diagnostics sur **stderr**, où votre hôte MCP décide de leur
sort. `TVS_LOG_LEVEL` règle ce qui est écrit et vaut `error` par défaut. À ce
réglage les lignes sont des pannes et des décomptes de lignes écartées ; à
`debug` les adresses jointes s'y ajoutent. Ces lignes restent sur votre machine.

## Les réglages qui changent tout cela

| Variable           | Ce qu'elle change                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `TVS_USER_AGENT`   | Place votre propre identifiant devant celui du projet, qui reste ajouté pour que le site puisse toujours joindre une personne. |
| `TVS_CACHE_TTL_MS` | La durée pendant laquelle une réponse est gardée en mémoire. `0` éteint le cache.                                              |
| `TVS_LOG_LEVEL`    | Ce qui est écrit sur stderr.                                                                                                   |

## Les enfants

Ce serveur est un outil pour développeurs et il ne s'adresse pas aux enfants.

## Les évolutions

Un changement de cette politique voyage dans une version, et le changelog le
nomme.

## Contact

Ouvrez une issue sur
[le dépôt](https://github.com/smeet666/mcp-tvsubtitles/issues). Pour quelque
chose d'exploitable, suivez [SECURITY.md](./SECURITY.md) à la place.
