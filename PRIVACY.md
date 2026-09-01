# Privacy

_[Version française](#confidentialité)_

`mcp-tvsubtitles` reads a public website. It has no account, no API key and no
telemetry.

## What it sends, and where

The only host it reaches is `https://www.tvsubtitles.net`. Every request carries
the `User-Agent` this server builds: its name, its version and the address of
this repository, so the site can reach a person about traffic it did not expect.
`TVS_USER_AGENT` puts a caller's own agent in front of that one, which stays
attached.

The words a search is given travel to the site as the search itself, because
that is the request. Nothing else about the caller is sent: no identifier, no
address, no history of earlier calls.

## What it stores

Pages are held in memory for fifteen minutes by default, keyed by the address
they came from, and at most two hundred of them. `TVS_CACHE_TTL_MS` and
`TVS_CACHE_MAX_ENTRIES` change both, and a lifetime of zero turns the store off.
The store lives in the process and is gone when it exits.

Nothing is written to disk.

## What it logs

Diagnostics go to stderr, never to stdout, which carries the protocol.
`TVS_LOG_LEVEL` is `error` by default, so what is written is a failure or a
count of rows that were dropped. At `debug` the addresses it fetches are written
too. Nothing is sent anywhere.

## Credentials

This server sends none, because the site asks for none. No environment variable
it reads is a secret.

---

<a name="confidentialité"></a>

# Confidentialité

_[English version](#privacy)_

`mcp-tvsubtitles` lit un site public. Il n'a ni compte, ni clé d'API, ni
télémétrie.

## Ce qu'il envoie, et où

Le seul hôte qu'il joint est `https://www.tvsubtitles.net`. Chaque requête porte
le `User-Agent` que ce serveur construit : son nom, sa version et l'adresse de ce
dépôt, pour que le site puisse joindre une personne à propos d'un trafic qu'il
n'attendait pas. `TVS_USER_AGENT` place l'agent d'un appelant devant celui-là,
qui reste attaché.

Les mots d'une recherche voyagent vers le site en tant que recherche, puisque
c'est la requête elle-même. Rien d'autre sur l'appelant n'est envoyé : aucun
identifiant, aucune adresse, aucun historique des appels précédents.

## Ce qu'il garde

Les pages sont gardées quinze minutes en mémoire par défaut, indexées par
l'adresse d'où elles viennent, et deux cents au plus. `TVS_CACHE_TTL_MS` et
`TVS_CACHE_MAX_ENTRIES` changent les deux, et une durée de zéro éteint le cache.
Le stock vit dans le processus et disparaît avec lui.

Rien n'est écrit sur le disque.

## Ce qu'il journalise

Les diagnostics vont sur stderr, jamais sur stdout, qui porte le protocole.
`TVS_LOG_LEVEL` vaut `error` par défaut, donc ce qui est écrit est une panne ou
un décompte de lignes écartées. À `debug`, les adresses jointes le sont aussi.
Rien n'est envoyé nulle part.

## Identifiants

Ce serveur n'en envoie aucun, parce que le site n'en demande aucun. Aucune
variable d'environnement qu'il lit n'est un secret.
