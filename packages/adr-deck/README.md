# adr-deck

Revue d'ADR (*Architecture Decision Records*) au format [MADR](https://adr.github.io/madr/) : **une ADR par diapositive, une décision en un clic**, écrite directement dans le fichier Markdown de l'ADR. Aucune base de données : les fichiers `NNNN-titre.md` sont l'unique source de vérité.

## Prérequis

Node.js ≥ 22.22.

## Lancer une revue

```sh
cd mon-projet
adr-deck                     # lit les ADR du dossier courant et ouvre le navigateur
adr-deck review ../autre     # autre dossier
adr-deck timeline            # même application, ouverte sur la frise chronologique des ADR
adr-deck serve docs/decisions  # frise en lecture seule, partagée sur le réseau local
```

Les ADR sont les fichiers `NNNN-titre.md` du dossier et de ses dossiers de catégorie (deux niveaux) ; s'il n'y en a pas, `docs/decisions`, `docs/adr`, `doc/adr`, `docs/architecture/decisions`, `adr` puis `decisions` sont essayés.

L'application est servie sur http://127.0.0.1:8787 (ou le port libre suivant). En séance : participants facultatifs (écrits dans `decision-makers` et `consulted`), puis pour chaque ADR **Valider**, **Refuser**, **Reporter** ou **À retravailler** (actions dans `### Actions`) ; une ADR acceptée se **remplace** ou se **rend obsolète** sans réécrire sa décision. Chaque modification est ciblée et s'annule à l'octet près ; les sauvegardes sont dans `~/.adr-deck/backups/`.

| Option | Rôle | Variable |
| --- | --- | --- |
| `-p, --port <port>` | Port d'écoute (défaut : 8787, ou le suivant libre) | `ADR_PORT` |
| `--host <hôte>` | Adresse d'écoute (défaut : 127.0.0.1, 0.0.0.0 pour `serve`) | `ADR_HOST` |
| `--no-open` | N'ouvre pas le navigateur (`serve` : `--open` pour l'ouvrir) | — |
| `--read-only` | `review`, `timeline` : refuse toute modification (toujours actif pour `serve`) | — |
| `-l, --lang <en\|fr\|es>` | Langue des libellés du `.docx` (`export`, défaut : en) | — |
| `-h, --help` / `-v, --version` | Aide / version | — |

## Langues

L'interface est en anglais, français et espagnol : elle suit la langue du navigateur et se change depuis l'en-tête. La sortie terminal est en anglais.

## Créer, exporter, importer et valider

```sh
adr-deck add                        # nouvelle ADR, champ par champ ; signale d'abord les ADR au sujet proche
adr-deck add --minimal -c backend   # modèle MADR minimal, dans le dossier de catégorie backend/
adr-deck export                     # <projet>-decisions.docx dans le dossier courant
adr-deck export revue.docx --lang fr  # nom de sortie et langue des libellés
adr-deck import revue.docx           # .docx exporté (éventuellement modifié dans Word) → fichiers MADR
adr-deck import revue.docx --force   # écrase aussi les ADR modifiées
adr-deck validate                   # code de sortie 1 si un fichier est illisible
adr-deck validate --strict          # + règles des modèles MADR et de markdownlint (pour la CI)
adr-deck validate docs/decisions/0003-cache.md
```

Le guide complet (problématique, écrans, méthode) est dans `docs/GUIDE.md` du dépôt.
