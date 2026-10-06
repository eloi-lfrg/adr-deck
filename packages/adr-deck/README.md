# adr-deck

Revue d'ADR (*Architecture Decision Records*) au format [MADR](https://adr.github.io/madr/) : **une ADR par diapositive, une décision en un clic**, écrite directement dans le fichier Markdown de l'ADR. Aucune base de données : les fichiers `NNNN-titre.md` sont l'unique source de vérité.

## Prérequis

Node.js ≥ 22.22.

## Lancer une revue

```sh
cd mon-projet
adr-deck --review            # lit les ADR du dossier courant et ouvre le navigateur
adr-deck --review ../autre   # autre dossier
```

Les ADR sont les fichiers `NNNN-titre.md` du dossier ; s'il n'y en a pas, `docs/decisions`, `docs/adr`, `doc/adr`, `docs/architecture/decisions`, `adr` puis `decisions` sont essayés.

L'application est servie sur http://127.0.0.1:8787 (ou le port libre suivant). Une décision modifie uniquement le front matter (`status`, `date`, `next-review`) et la phrase de tête de « Decision Outcome » ; les sauvegardes sont dans `~/.adr-deck/backups/`.

| Option | Rôle | Variable |
| --- | --- | --- |
| `-r, --review [dossier]` | Lance la revue (défaut : dossier courant) | — |
| `-p, --port <port>` | Port d'écoute (défaut : 8787, ou le suivant libre) | `ADR_PORT` |
| `--host <hôte>` | Adresse d'écoute (défaut : 127.0.0.1) | `ADR_HOST` |
| `--no-open` | N'ouvre pas le navigateur | — |
| `-l, --lang <en\|fr\|es>` | Langue des libellés du `.docx` (`export`, défaut : en) | — |
| `-h, --help` / `-v, --version` | Aide / version | — |

## Langues

L'interface est en anglais, français et espagnol : elle suit la langue du navigateur et se change depuis l'en-tête. La sortie terminal est en anglais.

## Exporter, importer et valider

```sh
adr-deck export                     # <projet>-decisions.docx dans le dossier courant
adr-deck export revue.docx --lang fr  # nom de sortie et langue des libellés
adr-deck import revue.docx           # .docx exporté (éventuellement modifié dans Word) → fichiers MADR
adr-deck import revue.docx --force   # écrase aussi les ADR modifiées
adr-deck validate                   # code de sortie 1 si un fichier est illisible
adr-deck validate docs/decisions/0003-cache.md
```
