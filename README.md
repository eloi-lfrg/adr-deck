# adr-deck

Revue d'ADR (*Architecture Decision Records*) rythmée et sobre : **une ADR par diapositive, une décision en un clic**, écrite directement dans les fichiers [MADR](https://adr.github.io/madr/) de votre projet.

C'est une application web **locale**, pensée pour être pilotée par une personne en partage d'écran pendant une réunion : on lance `adr-deck --review` dans un projet, le navigateur s'ouvre sur ses ADR. Aucune base de données : **les fichiers `NNNN-titre.md` sont l'unique source de vérité**.

## Sommaire

- [Installation sur le poste](#installation-sur-le-poste)
- [Utilisation](#utilisation)
- [Langues](#langues)
- [Raccourcis clavier](#raccourcis-clavier)
- [Le format MADR](#le-format-madr)
- [Créer des ADR](#créer-des-adr)
- [Exporter en `.docx`](#exporter-en-docx)
- [Développement](#développement)
- [Docker](#docker)
- [Scripts npm](#scripts-npm)
- [Architecture](#architecture)
- [Design](#design)
- [Dépannage](#dépannage)
- [Limites connues](#limites-connues)

## Installation sur le poste

Prérequis : Node.js ≥ 22.22 (`nvm install 22.22 && nvm use`).

```sh
npm install
npm run install:global     # construit le paquet, l'emballe et l'installe avec npm install -g
```

La commande `adr-deck` est alors disponible partout. L'installation est une copie autonome (installée depuis le tarball) : elle ne dépend pas de ce dépôt. Pour mettre à jour, relancer `npm run install:global` ; pour désinstaller, `npm run uninstall:global`.

Avec nvm, les paquets globaux sont propres à chaque version de Node : `adr-deck` est disponible tant que Node 22.22 (ou la version active lors de l'installation) est utilisé.

## Utilisation

```sh
cd ~/workspace/mon-projet
adr-deck --review              # serveur local + ouverture du navigateur
```

| Commande | Rôle |
| --- | --- |
| `adr-deck --review [dossier]` | Revue des ADR du dossier (défaut : dossier courant) |
| `adr-deck export [sortie.docx]` | `.docx` de toutes les ADR (défaut : `<projet>-decisions.docx` dans le dossier courant ; libellés en anglais, `--lang fr` ou `--lang es` sinon) |
| `adr-deck validate [chemin…]` | Vérifie des fichiers ou des dossiers MADR ; code de sortie 1 en cas d'erreur |
| `adr-deck --help` / `--version` | Aide / version |

Options : `-p, --port <port>` (défaut 8787, ou le suivant libre ; `ADR_PORT`), `--host <hôte>` (défaut 127.0.0.1 ; `ADR_HOST`), `--no-open`, `-d, --dir <dossier>` (point de départ d'`export` et `validate`), `-o, --output <fichier>`, `-l, --lang <en|fr|es>` (langue des libellés du `.docx`).

Toute la sortie terminal (CLI, serveur) est en anglais. `Ctrl+C` arrête le serveur immédiatement, même avec le navigateur ouvert ; un second `Ctrl+C` force la sortie.

### Où sont cherchées les ADR

Les ADR sont les fichiers `NNNN-titre.md` (numéro d'au moins 3 chiffres). Le premier dossier qui en contient est retenu :

1. le dossier de lancement ;
2. `docs/decisions` (convention MADR), `docs/adr`, `doc/adr`, `docs/architecture/decisions`, `adr`, `decisions`.

Le dossier retenu est affiché au lancement et en tête de la grille. Les autres `.md` (`README.md`, `template.md`…) sont ignorés.

### Parcours d'une revue

1. **Grille** — toutes les ADR du dossier : onglets par statut avec compteurs, recherche plein texte, filtre par tags, tri (numéro, date, statut). Un clic sur une carte ouvre le diaporama sur cette ADR. La pastille dans le coin d'une carte l'ajoute à une sélection. Les fichiers illisibles sont signalés dans un encart dépliable (fichier, ligne, message) et écartés de la revue.
2. **Diaporama** — « Lancer la revue » (ou `R`) passe en plein écran. Pour chaque ADR : lire le contexte et les critères de décision, sélectionner une ou plusieurs options, puis **Valider**, **Refuser** ou **Reporter**, avec un commentaire et une date de prochaine revue facultatifs. La diapositive suivante arrive après 1,2 s (avance automatique désactivable) ; le fichier est enregistré en arrière-plan.
3. **Récapitulatif** — à la fin : compteurs de la séance, décisions prises avec leurs commentaires, export `.docx`.

### Modes du diaporama

| Mode | Contenu | Comportement |
| --- | --- | --- |
| À décider | ADR `proposed` (+ `deferred`, option activée par défaut) | Diapositives éditables |
| Décidées | ADR `accepted`, `rejected`, `superseded`, `deprecated` | Lecture seule, bouton « Modifier la décision » (`M`) |
| Toutes | Toutes les ADR | Éditables si non tranchées |
| Sélection | ADR cochées dans la grille, ou ADR visibles après filtre (clic sur une carte) | Idem |

La liste est figée au lancement : décider une ADR ne la fait pas disparaître du diaporama.

### Décisions

- **Valider** exige au moins une option sélectionnée (clic sur la carte ou touches `1` à `9`). Plusieurs options peuvent être retenues.
- Une ADR `proposed` dont « Decision Outcome » nomme déjà une option (`Chosen option: "…"`) arrive avec cette option présélectionnée et sa justification dans le commentaire.
- **Refuser** : aucune option retenue. **Reporter** : date « Prochaine revue » facultative (icône calendrier).
- La **date** est posée automatiquement (date du jour, fuseau Europe/Paris).
- **`Ctrl+Z`** annule la dernière décision de la séance : le fichier retrouve **exactement** son contenu d'avant.

### ADR remplacées

Une ADR `superseded by ADR-0008` affiche un lien vers sa remplaçante, avec son titre :

- sur sa carte dans la grille (« remplacée par ADR-0008 ↗ ») ;
- dans la barre du bas de sa diapositive, et avec la touche **`L`** ;
- l'ADR remplaçante indique en retour « remplace ADR-0007 », avec un lien.

Si la remplaçante n'est pas dans la liste du diaporama en cours, elle s'ouvre en mode « Toutes ». Une ADR remplaçante absente du dossier est signalée par un avertissement.

### Mode présentation

En diaporama, les contrôles et le curseur s'effacent quand la souris reste immobile 2 s ; ils réapparaissent au moindre mouvement ou en approchant du haut de l'écran. La revue se mène entièrement au clavier. Seul un fin trait de progression reste visible en haut.

### Enregistrement

L'indicateur en haut à droite affiche *Enregistrement…*, *Enregistré* ou *Erreur* (avec *Réessayer*). Une décision est écrite dans son fichier en moins d'une seconde. Si un fichier est modifié hors de l'application (éditeur, `git pull`), l'interface le recharge à chaud sans perdre les décisions en attente ; un fichier ajouté ou supprimé apparaît ou disparaît de la grille.

Avant chaque écriture, la version précédente est sauvegardée (10 dernières par fichier) dans `~/.adr-deck/backups/<dossier>-<empreinte>/`, hors du dépôt.

## Langues

L'interface existe en **anglais, français et espagnol**. Au premier lancement, elle suit la langue du navigateur (première langue prise en charge dans ses préférences, anglais sinon) et change d'elle-même si la langue du navigateur change.

Le bouton de langue dans l'en-tête (icône 文A et code `EN` / `FR` / `ES`) permet de choisir une langue fixe ou de revenir à « Automatique ». Le choix est mémorisé dans le navigateur. La palette `Ctrl+K` propose aussi « Changer de langue ».

La langue de l'interface s'applique aussi aux messages de format (encart de la grille) et aux libellés du `.docx` exporté depuis l'application. Le contenu des ADR n'est jamais traduit ; la phrase écrite dans « Decision Outcome » suit la langue des titres du fichier (anglais ou français).

## Raccourcis clavier

`?` affiche l'aide des raccourcis dans le diaporama.

| Touche | Action |
| --- | --- |
| `←` / `→` | ADR précédente / suivante |
| `1` à `9` | Sélectionner / désélectionner l'option P1 à P9 |
| `V` / `X` / `P` | Valider / Refuser / Reporter |
| `C` | Focus sur le commentaire (`Entrée` ou `Échap` pour sortir) |
| `M` | Modifier une décision existante |
| `L` | Aller à l'ADR qui remplace l'ADR affichée |
| `S` | Sommaire des miniatures |
| `G` | Retour à la grille |
| `F` | Plein écran |
| `Ctrl+Z` / `⌘Z` | Annuler la dernière décision de la séance |
| `Ctrl+K` / `⌘K` | Recherche et actions |
| `?` | Aide des raccourcis (diaporama) |
| `Échap` | Fermer le panneau ou quitter le diaporama |
| `R` (grille) | Lancer la revue |
| `/` (grille) | Rechercher |
| `E` (récapitulatif) | Exporter en `.docx` |

## Le format MADR

**Un fichier = une ADR**, nommé `NNNN-titre.md` ; l'identifiant affiché vient du numéro (`0007-cache.md` → `ADR-0007`). Le modèle est dans `templates/madr.md`, des exemples couvrant tous les statuts dans `examples/decisions/`.

```markdown
---
status: accepted
date: 2026-10-05
decision-makers: Eloi, Marie
tags: [backend, infra]
---

# Choix de la file de messages

## Context and Problem Statement

Les traitements asynchrones passent aujourd'hui par des tâches cron.

## Decision Drivers

* Reprise sur erreur

## Considered Options

* PostgreSQL comme file (pg-boss)
* RabbitMQ

## Decision Outcome

Chosen option: "PostgreSQL comme file (pg-boss)", because suffisant pour nos volumes.

### Consequences

* Good, because aucune infrastructure supplémentaire.

## Pros and Cons of the Options

### PostgreSQL comme file (pg-boss)

Réutilise la base existante.

* Good, because zéro infra en plus
* Bad, because débit limité

### RabbitMQ

* Good, because débit, routage riche
```

### Lecture

| Élément | Utilisation |
| --- | --- |
| Front matter | `status`, `date`, `decision-makers` (ou `deciders`), `tags` (liste ou texte séparé par des virgules), `next-review`. Absent : ADR `proposed`. |
| `# Titre` | Titre de la diapositive (obligatoire). |
| `## Context and Problem Statement` | Contexte affiché. |
| `## Decision Drivers` | Critères de décision, affichés sous le contexte. |
| `## Considered Options` | Une option par puce → cartes P1, P2… |
| `## Pros and Cons of the Options` | Sous-sections `### <option>` rattachées par titre : texte, `Good, because …` (pour), `Bad, because …` (contre). |
| `## Decision Outcome` | `Chosen option(s): "A" [and "B"], because …` → options retenues et commentaire. |

Les titres français courants sont acceptés (`Contexte et problématique`, `Options envisagées`, `Décision`, `Avantages et inconvénients des options`, `Bon, car …` / `Mauvais, car …`). Les commentaires HTML (`<!-- … -->`) sont ignorés.

### Statuts

| `status` MADR | Dans l'application | Écrit lors de |
| --- | --- | --- |
| `proposed` (ou absent, `draft`) | À décider | — |
| `accepted` | Validée | Valider |
| `rejected` | Refusée | Refuser |
| `deferred` (+ `next-review`) | Reportée | Reporter |
| `superseded by ADR-0012` | Remplacée | (saisi dans le fichier) |
| `deprecated` | Obsolète | (saisi dans le fichier) |

Un statut inconnu est lu comme « à décider » avec un avertissement.

### Écriture

Une décision ne modifie **que** :

- les clés `status`, `date` et `next-review` du front matter (créé s'il manque ; les autres clés, l'ordre et les guillemets sont conservés) ;
- la phrase de tête de `## Decision Outcome` (section créée avant « Pros and Cons » si elle manque) ; les sous-sections (`### Consequences`…) sont conservées. La phrase est écrite dans la langue des titres du fichier : `Chosen option: "A", because …` ou `Option retenue : « A », car …`.

Tout le reste du fichier est conservé à l'octet près, fins de ligne CRLF comprises. Annuler une décision restaure les deux zones telles qu'elles étaient.

### Erreurs

`adr-deck validate` (ou `npm run validate -- <chemin>`) signale les problèmes avec leur ligne. Sont des **erreurs** (fichier écarté de la revue) : titre `#` absent, front matter YAML invalide, numéro en double. Sont des **avertissements** : statut inconnu, aucune option envisagée (validation impossible), option retenue absente des options, ADR remplaçante introuvable. Le serveur refuse d'écrire un contenu en erreur.

## Créer des ADR

- **À la main** : copier `templates/madr.md` en `docs/decisions/NNNN-titre.md`.
- **Depuis n'importe quelle source** (compte rendu, notes, PDF, Word, fil de discussion) : le skill Claude Code du dépôt `adr-extract` produit des fichiers MADR validés, sans rien inventer :

  ```text
  /adr-extract ~/Documents/compte-rendu-comite.pdf docs/decisions
  ```

## Exporter en `.docx`

Depuis la grille (icône d'export), le récapitulatif (`E`), la palette `Ctrl+K` (libellés dans la langue de l'interface), ou en ligne de commande :

```sh
adr-deck export                 # dans le dossier du projet
adr-deck export ~/Bureau/revue.docx --lang fr
```

Le `.docx` est une **vue** des fichiers MADR, pas une seconde source de vérité : page de garde (nom du projet, dossier, date), tableau récapitulatif de toutes les ADR avec le statut coloré, puis une section par ADR (métadonnées, contexte, critères, options avec pour et contre, décision). Depuis l'application, le fichier est téléchargé ; rien n'est écrit dans le dossier des ADR.

## Développement

```sh
nvm use            # Node 22.22 (lu depuis .nvmrc)
npm install
npm run dev        # serveur API (127.0.0.1:8787) + front Vite (localhost:5173)
```

En développement, le serveur lit `./workspace` (ignoré par git) ; s'il ne contient aucun fichier MADR, les exemples de `examples/decisions/` y sont copiés. Pour travailler sur un autre dossier :

```sh
ADR_WORKSPACE=~/workspace/mon-projet npm run dev
```

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ADR_WORKSPACE` | `./workspace` | Dossier de départ de la recherche des ADR (`npm run dev`, Docker) |
| `ADR_TITLE` | nom du dossier | Nom affiché et page de garde du `.docx` |
| `ADR_PORT` | `8787` | Port du serveur local (le proxy Vite le suit) |
| `ADR_HOST` | `127.0.0.1` | Interface d'écoute |
| `ADR_WEB_PORT` | `5173` | Port du front Vite en développement |

### Conventions

- TypeScript strict partout, sans `any` ; composants Vue en `<script setup lang="ts">`.
- Code, commentaires, tests et **toute sortie terminal ou message d'API** en anglais ; interface traduite (anglais, français, espagnol) ; documentation en français.
- Composants d'interface : shadcn-vue uniquement (`npm run ui:add -- <composant>`), icônes `@lucide/vue`.
- Aucune base de données : toute donnée persistante vit dans les fichiers MADR.
- Tout nouveau script utile est déclaré dans le `package.json` racine.

### Tests

| Paquet | Couverture |
| --- | --- |
| `@adr/format` | Lecture MADR (anglais, français, sans front matter, blocs de code), statuts, décisions, annulation octet pour octet sur chaque exemple, collection (ordre, doublons, liens de remplacement) |
| `@adr/convert` | Export `.docx` des exemples, libellés en/fr/es |
| `@adr/server` | Recherche du dossier, API, conflits de révision, sauvegardes, surveillance du dossier |
| `@adr/web` | File d'écriture par fichier et rejeu en cas de conflit, rendu Markdown, i18n (détection, catalogues complets, dates) ; e2e : revue complète au clavier, rechargement à chaud, navigation vers l'ADR remplaçante, langue du navigateur et changement de langue |
| `adr-deck` | Arguments de la CLI ; `npm run test:package` installe le tarball et teste `--review`, `validate` et `export` |

Avant de livrer : `npm run check`, `npm run test:e2e:chrome` pour toute modification d'interface, `npm run test:package` pour la CLI.

## Docker

Une image de production : le serveur Hono sert l'API et le front compilé, sur le port 8787.

```sh
ADR_DATA_DIR=~/workspace/mon-projet npm run docker:up   # → http://127.0.0.1:8787
npm run docker:logs
npm run docker:down
```

Le dossier `ADR_DATA_DIR` (défaut `./workspace`) est monté sur `/data` ; les ADR y sont cherchées comme en local (`docs/decisions`…). Le port n'est publié que sur `127.0.0.1`. Les sauvegardes restent dans le conteneur.

## Scripts npm

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Front (Vite) + serveur (Hono) en mode développement |
| `npm run dev:server` / `npm run dev:web` | L'un ou l'autre seulement |
| `npm run build` | Build de production du front |
| `npm start` | Build du front puis serveur unique sur http://127.0.0.1:8787 |
| `npm test` | Tests Vitest de tous les paquets |
| `npm run typecheck` | Vérification TypeScript stricte de tous les paquets |
| `npm run check` | `typecheck` puis `test` |
| `npm run validate -- <chemin>` | Vérifie des fichiers ou dossiers MADR (chemins relatifs à la racine du dépôt) |
| `npm run validate:example` | Vérifie `examples/decisions` |
| `npm run export -- [sortie.docx] [--dir <dossier>] [--lang <en\|fr\|es>]` | Export `.docx` |
| `npm run install:global` | Construit et installe `adr-deck` globalement |
| `npm run uninstall:global` | Désinstalle `adr-deck` |
| `npm run build:package` | Construit le paquet npm `adr-deck` (front + CLI regroupée) |
| `npm run test:package` | Teste le tarball installé dans un projet temporaire |
| `npm run pack:package` | Produit le tarball `adr-deck-<version>.tgz` |
| `npm run test:e2e:install` | Télécharge le Chromium de Playwright (une fois) |
| `npm run test:e2e` / `test:e2e:chrome` | Parcours Playwright (Chromium de Playwright / Chrome installé) |
| `npm run ui:add -- <composant>` | Ajoute un composant shadcn-vue au front |
| `npm run docker:build` / `docker:up` / `docker:down` / `docker:logs` | Image Docker |
| `npm run clean` | Supprime les builds et rapports de test |

## Architecture

```text
adr-deck/
├── apps/
│   ├── web/              Vue 3, Vite, TypeScript strict, Pinia, Vue Router, shadcn-vue, Tailwind v4, motion-v, i18n en/fr/es
│   └── server/           Node 22 + Hono : recherche du dossier, API fichiers, écriture atomique, sauvegardes, SSE
├── packages/
│   ├── format/           @adr/format : lecture MADR, statuts, édition ciblée (décision, annulation), collection
│   ├── convert/          @adr/convert : export .docx
│   └── adr-deck/         paquet npm : CLI « adr-deck » (--review, export, validate), build esbuild, test du tarball
├── examples/decisions/   9 ADR MADR couvrant tous les statuts
├── templates/madr.md     modèle d'ADR
├── .claude/skills/       skill adr-extract
├── Dockerfile, docker-compose.yml
└── workspace/            dossier de développement (ignoré par git)
```

Les paquets internes sont consommés directement en TypeScript ; seul `adr-deck` est compilé (esbuild), au moment du `npm pack`.

### Flux d'enregistrement

1. Chaque décision est une **opération** rejouable (`decide`, `undo`) appliquée au texte du fichier concerné ; l'interface est optimiste.
2. Une file d'écriture regroupe les changements (anti-rebond 400 ms) et envoie chaque fichier modifié avec sa révision connue (`If-Match`, hash SHA-256 du contenu).
3. Le serveur vérifie que le fichier n'a pas changé, sauvegarde la version courante, écrit dans un fichier temporaire puis le renomme (écriture atomique).
4. En cas de conflit (`409`), l'application reprend le fichier du disque, **rejoue les opérations en attente** et prévient l'utilisateur.
5. Toute modification externe est signalée par SSE : rechargement à chaud du fichier, avec rejeu des opérations non encore enregistrées.

### API locale

| Méthode | Route | Usage |
| --- | --- | --- |
| GET | `/api/health` | État du serveur et dossier des ADR |
| GET | `/api/adrs` | Nom du projet, dossier, et tous les fichiers MADR (contenu, révision) |
| GET | `/api/adrs/:name` | Contenu et révision d'un fichier |
| PUT | `/api/adrs/:name` | Écriture (`If-Match` obligatoire ; `409` si conflit, `422` si contenu invalide) |
| GET | `/api/export/docx?lang=fr` | `.docx` de toutes les ADR lisibles (libellés en `en`, `fr` ou `es`) |
| GET | `/api/events` | Flux SSE : `changed` (fichier modifié ailleurs), `files` (fichier ajouté ou supprimé) |

Les erreurs renvoient `{ error, code }` : `error` en anglais, `code` (`notFound`, `conflict`, `invalidContent`…) traduit par l'interface. Le serveur n'écoute que sur `127.0.0.1` et n'accepte que des noms `NNNN-titre.md`, sans chemin.

## Design

- **Direction** : sobre, centrée sur la diapositive. Fond quasi noir par défaut (thème clair et réglage système disponibles), gris neutres, pas de décor.
- **Couleurs** : un seul accent, le bleu shadcn (blue-600 / blue-500), et des couleurs de statut franches — bleu ciel (à décider), vert émeraude (validée), rouge (refusée), ambre (reportée), gris (remplacée), violet (obsolète).
- **Typographie** : Inter uniquement. En diaporama, titres ≥ 40 px et texte ≥ 20 px, lisibles à 3 m.
- **Animations** (motion-v et `<Transition>`) : glissement entre ADR, apparition en cascade, sceau de décision, transition partagée grille → diapositive. Avec `prefers-reduced-motion`, tout devient un fondu de 150 ms.
- **Accessibilité** : focus visible, libellés ARIA sur les décisions et les cartes, contrastes AA, navigation complète au clavier.

## Dépannage

| Symptôme | Solution |
| --- | --- |
| `adr-deck: command not found` | Version de Node différente de celle de l'installation (nvm) : `nvm use 22.22`, ou relancer `npm run install:global` |
| « Aucun fichier MADR trouvé » | Lancer depuis le dossier des ADR ou la racine du projet ; vérifier le nommage `NNNN-titre.md` |
| Une ADR n'apparaît pas | Elle est en erreur : voir l'encart en tête de la grille ou `adr-deck validate` |
| Port 8787 occupé | `adr-deck` prend le suivant libre ; avec `--port` explicite, en choisir un autre |
| « … modifié ailleurs » | Normal : le fichier a changé pendant la revue ; vos décisions en attente ont été réappliquées |
| Indicateur *Erreur* | Serveur arrêté ou contenu refusé : relancer puis *Réessayer* |
| `Executable doesn't exist` (Playwright) | `npm run test:e2e:install`, ou `npm run test:e2e:chrome` |

## Limites connues

- Le récapitulatif et la pile d'annulation portent sur la séance en cours : un rechargement de la page les réinitialise (les décisions, elles, sont dans les fichiers).
- Pas d'historique des décisions dans le fichier (format MADR pur) : l'historique, c'est git.
- Les statuts « remplacée » et « obsolète » se saisissent dans le fichier, pas depuis la barre de décision.
- Les décideurs (`decision-makers`) ne sont pas modifiés par l'application.
- Les sous-dossiers ne sont pas parcourus : un seul dossier d'ADR par revue.
- Pas de multi-utilisateur temps réel ni d'hébergement en ligne : l'application est conçue pour un poste local.
