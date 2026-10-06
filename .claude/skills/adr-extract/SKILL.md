---
name: adr-extract
description: Extrait des décisions d'architecture (ADR) de n'importe quelle source — fichier texte, Markdown, Word (.docx), PDF, compte rendu de réunion, notes, export Notion, fil de discussion ou texte collé — et produit des fichiers MADR (`NNNN-titre.md`, une ADR par fichier) valides pour adr-deck. À utiliser dès que l'utilisateur veut « transformer », « convertir », « importer » ou « créer les ADR » à partir d'un document ou d'un texte.
argument-hint: <chemin du fichier ou texte> [dossier de sortie]
---

# Extraire des ADR au format MADR

Objectif : à partir de **n'importe quelle entrée**, produire des fichiers [MADR](https://adr.github.io/madr/) **valides** (validés par `npm run validate`), fidèles à la source, prêts à être revus avec `adr-deck --review`.

Entrée : `$ARGUMENTS` — un ou plusieurs chemins de fichiers, une URL déjà accessible via un outil, ou du texte collé dans la conversation. Si rien n'est fourni, demander la source.

## 1. Lire la source

| Source | Comment la lire |
| --- | --- |
| Fichiers MADR existants | Déjà au format : seulement valider (étape 4) et corriger si besoin. |
| `.docx` | `textutil -convert txt -stdout "<fichier>"` (macOS), sinon le skill docx. |
| `.pdf` | Outil Read (paramètre `pages` au-delà de 10 pages). |
| `.md`, `.txt`, `.csv`, `.json`, transcription, notes, texte collé | Lecture directe. |
| Image / capture | Outil Read (vision). |

Toujours lire **toute** la source avant d'écrire.

## 2. Repérer les décisions

Une ADR = une question d'architecture à trancher ou tranchée. Pour chacune, relever ce que la source dit vraiment :

- **Numéro** : conserver le numéro d'origine s'il existe (`ADR-21` → fichier `0021-…md`). Sinon continuer la numérotation du dossier de sortie (dernier numéro + 1), dans l'ordre de la source. Les numéros sont uniques. Les renvois à d'autres ADR dans les textes s'écrivent `ADR-0021`.
- **Titre** : court, tel que dans la source si possible.
- **Statut** (front matter `status`) :

  | Dans la source | `status` |
  | --- | --- |
  | à prendre, ouvert, en discussion, à instruire, proposé, à valider | `proposed` |
  | validé, acté, accepté, adopté, décidé | `accepted` |
  | refusé, rejeté, abandonné | `rejected` |
  | reporté, en attente, hors périmètre, plus tard | `deferred` (+ raison dans « Decision Outcome ») |
  | remplacé par une autre ADR | `superseded by ADR-0012` |
  | obsolète, caduc | `deprecated` |

- **Tags** (`tags: [a, b]`, facultatif) : la partie, le thème ou le domaine.
- **Contexte** : le problème et les contraintes, repris fidèlement. Les informations sans place dédiée (échéance, blocage, tickets) vont en liste à puces sous le texte, ou dans « More Information ».
- **Options** : une par option envisagée, titre court commençant par une majuscule. Compléter une option elliptique pour qu'elle se lise seule.
- **Décision rédigée** : pour une ADR `accepted`, ou `proposed` avec une recommandation, écrire `Chosen option: "<titre exact de l'option>", because <justification>.` La recommandation d'une ADR proposée sera présélectionnée pendant la revue.

**Ne rien inventer** : ni date, ni décideur, ni option, ni argument. Une information absente reste absente (pas de `date` si la source n'en donne pas). Sans option formulée, pas de « Considered Options » : l'ADR pourra être refusée ou reportée, pas validée.

## 3. Écrire les fichiers

Un fichier par ADR, nommé `NNNN-titre-en-kebab-case.md` (4 chiffres). Format (voir `templates/madr.md` et `examples/decisions/`) :

```markdown
---
status: proposed
date: 2026-10-05
decision-makers: Eloi, Marie
tags: [backend]
---

# <Titre>

## Context and Problem Statement

<texte>

## Considered Options

* <Option 1>
* <Option 2>

## Decision Outcome

Chosen option: "<Option 1>", because <justification>.

### Consequences

* Good, because …
* Bad, because …

## Pros and Cons of the Options

### <Option 1>

<texte facultatif>

* Good, because …
* Bad, because …

### <Option 2>

## More Information

<échéances, tickets, conditions de révision>
```

Règles :

- `date` et `decision-makers` seulement si la source les donne.
- « Decision Outcome » : omis pour une ADR proposée sans recommandation ; sinon une phrase de tête (`Chosen option: …`, `Rejected, because …`, `Deferred, because …`), puis éventuellement `### Consequences`.
- Les titres de « Pros and Cons of the Options » reprennent **exactement** ceux de « Considered Options ».
- Titres de section MADR en anglais par défaut ; si l'utilisateur veut du français : `## Contexte et problématique`, `## Options envisagées`, `## Décision`, `## Avantages et inconvénients des options` (arguments `* Bon, car …` / `* Mauvais, car …`).
- Une ligne vide entre chaque bloc, le fichier se termine par un saut de ligne.

**Emplacement** : le dossier demandé par l'utilisateur ; sinon `docs/decisions/` du projet courant, ou `workspace/` dans ce dépôt. **Ne jamais écraser** un fichier existant sans le demander.

## 4. Valider et corriger

```sh
npm run validate -- <dossier>        # dans ce dépôt
adr-deck validate <dossier>          # avec le paquet installé
```

Corriger toutes les **erreurs** et recommencer. Les avertissements (ex. « aucune option envisagée ») sont acceptables s'ils reflètent la source.

## 5. Rendre compte

Répondre en français, brièvement :

- dossier, fichiers créés et nombre d'ADR par statut ;
- les interprétations faites (statuts ramenés à un autre, options complétées, informations placées dans le contexte) ;
- ce qui manquait dans la source (ADR sans option, sans contexte…) ;
- comment ouvrir la revue : `adr-deck --review` depuis le dossier (ou son projet).
