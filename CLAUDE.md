# CLAUDE.md — adr-deck

Application web locale de revue d'ADR au format **MADR** : `adr-deck` (ou `adr-deck review [dossier]`) lance l'application sur les fichiers `NNNN-titre.md` du dossier courant (ou de `docs/decisions`, `docs/adr`…, dossiers de catégorie compris), une ADR par diapositive, une décision écrite directement dans le fichier MADR. Le README (en anglais) décrit le produit ; `docs/GUIDE.md` (en français) est le guide d'usage complet (problématique, écrans, méthode, captures dans `docs/images/`). Ce fichier résume ce qu'il faut savoir pour travailler dans le code.

## Commandes

Node **22.22** (`nvm use`, voir `.nvmrc`) et **npm workspaces** — jamais pnpm ni yarn.

```sh
npm install
npm run dev                  # serveur 127.0.0.1:8787 + front localhost:5173
npm run check                # typecheck + tous les tests unitaires — à lancer avant de rendre la main
npm run test:e2e:chrome      # parcours Playwright avec le Chrome installé (le Chromium Playwright peut manquer)
npm run validate -- <fichier|dossier>
npm run validate:strict -- <fichier|dossier>   # + modèles MADR et markdownlint ; validate:example est strict
npm run serve -- <dossier>   # frise en lecture seule sur le réseau local
npm run export -- [sortie.docx] [--dir <dossier>] [--lang <en|fr|es>]
npm run import -- <fichier.docx> [dossier] [--force]   # .docx exporté → fichiers MADR
npm run add -- [dossier] [--minimal] [--category <dossier>]   # nouvelle ADR en mode interactif
npm run test:package         # build + npm pack + test du paquet adr-deck installé (review, validate, export)
npm run install:global       # installe adr-deck globalement depuis le tarball
```

**Tout script utile doit être déclaré dans le `package.json` racine** (exigence du projet) ; les scripts racine délèguent aux workspaces avec `-w <paquet>`. Ne pas documenter une commande qui n'a pas de script.

## Structure

| Chemin | Rôle |
| --- | --- |
| `packages/format` | `@adr/format` : schéma Zod (`schema.ts`), titres et statuts MADR FR/EN (`vocabulary.ts`), structure des lignes (`layout.ts`), lecture (`parse.ts`), édition ciblée `decide` / `rework` / `supersedes` / `undo` avec participants (`operations.ts`), sous-sections Consequences / Confirmation / Actions (`sections.ts`), écriture d'un fichier MADR complet (`serialize.ts`), collection d'un dossier (`collection.ts`), chemins `[catégorie/]NNNN-titre.md` et numéro suivant (`files.ts`), validation stricte et markdownlint (`lint.ts`), ADR proches (`similar.ts`), dates Europe/Paris (`dates.ts`) |
| `packages/convert` | `@adr/convert` : export `.docx` d'une collection d'ADR (`export.ts`), import inverse (`import.ts`, mammoth), libellés en/fr/es (`styles.ts`) |
| `packages/adr-deck` | Paquet npm : CLI `adr-deck` (`src/cli.ts`, `src/args.ts` : `review` par défaut, `timeline` (même application ouverte sur `/timeline`), `serve` (lecture seule, `0.0.0.0`), `add`, `export`, `import`, `validate [--strict]` ; questions de `add` dans `src/add.ts`, testées avec des réponses scriptées), regroupée par esbuild avec les `@adr/*` (`scripts/build.ts`), test du tarball (`scripts/smoke.ts`), installation globale (`scripts/install-global.ts`) |
| `apps/server` | Hono : API (`app.ts`, option `readOnly` → 403), recherche du dossier des ADR et des dossiers de catégorie, écriture atomique, sauvegardes dans `~/.adr-deck/backups`, surveillance (`workspace.ts`), configuration de dev (`config.ts`, `ADR_READ_ONLY=1`) |
| `apps/web` | Vue 3 : vues (`views/`), diaporama (`components/slideshow/`, dont `LifecycleDialog.vue` remplacer / rendre obsolète), participants (`components/ParticipantsDialog.vue`), frise chronologique (`views/TimelineView.vue`, `components/timeline/`, tri et regroupement dans `lib/timeline.ts`), store de la collection et file d'écriture par fichier (`stores/review.ts`), traductions (`i18n/`), composants shadcn-vue générés (`components/ui/`) |
| `examples/decisions/` | 15 ADR MADR couvrant tous les statuts — servent aux tests (annulation octet pour octet) et de graine en dev |
| `templates/` | Modèles MADR complet (`madr.md`) et minimal (`madr-minimal.md`) |
| `docs/` | Guide d'usage en français (`GUIDE.md`) et ses captures (`images/`) |
| `.claude/skills/adr-extract` | Skill : n'importe quelle source → fichiers MADR validés |
| `workspace/` | Dossier de développement par défaut, ignoré par git |

Les paquets internes sont consommés en TypeScript source (pas de build) : imports avec extension `.ts` dans `packages/*` et `apps/server`, alias `@/` dans `apps/web`. Seul `adr-deck` est compilé (esbuild) : une nouvelle dépendance tierce utilisée à l'exécution par le serveur ou la conversion doit aussi être ajoutée à ses `dependencies`, sinon `npm run build:package` échoue.

## Invariants à préserver

- **Un fichier = une ADR** ; l'ID vient du numéro du fichier (`0007-x.md` ou `backend/0007-x.md` → `ADR-0007`). Deux fichiers au même numéro, même dans des dossiers différents : le second est en erreur. Le nom d'un fichier (`Adr.file`, nom côté API) est son chemin relatif avec `/`, au plus deux dossiers de catégorie (`isMadrPath`), jamais hors du dossier des ADR.
- **Édition ciblée** : une opération ne touche que le front matter (`status`, `date`, `next-review`, et `decision-makers` / `consulted` quand il y a des participants), la phrase de tête de « Decision Outcome » (décider) et « More Information » (`### Actions` d'un retravail, note datée d'un remplacement ou d'une obsolescence). Remplacer ou rendre obsolète **garde la phrase de décision et la date**. Le reste du fichier est conservé à l'octet près (CRLF compris).
- **Annulation exacte** : `applyUndo(op(x), snapshotOf(x)) === x` pour `decide` et `rework` (testé sur chaque exemple) ; un remplacement modifie deux fichiers en une seule étape d'annulation. Pas d'historique dans le fichier (MADR pur).
- **Statuts écrits en vocabulaire MADR** (`proposed`, `accepted`, `rejected`, `deferred`, `superseded by ADR-xxxx`, `deprecated`) ; statuts affichés en français (`STATUSES`). La phrase de décision suit la langue des titres du fichier. Ajouter un synonyme = `vocabulary.ts`.
- **Date de décision** posée automatiquement en Europe/Paris ; ne jamais inventer de date.
- **Valider exige au moins une option** (contrôlé dans `applyDecision` et dans l'interface).
- **Aucune base de données** ; le serveur refuse d'écrire un contenu en erreur (422), vérifie la révision par fichier (`If-Match`, 409) et refuse toute écriture en lecture seule (403, `serve`). Rien n'est écrit dans le dossier des ADR hors des fichiers eux-mêmes (sauvegardes dans `~/.adr-deck`, export `.docx` téléchargé).
- **Aller-retour `.docx`** : `importDocx(exportDocx(adrs))` redonne les mêmes ADR (test sur chaque exemple, en/fr/es). Tout champ ajouté au modèle `Adr` doit être exporté **et** relu. Les fichiers écrits restent du MADR canonique (titres et métadonnées du modèle MADR) : la conformité MADR prime.
- Les modifications de l'interface passent par des `DocumentOperation` rejouables (`decide`, `rework`, `supersedes`, `undo`) appliquées au texte du fichier, pour que le rejeu après conflit ou rechargement fonctionne.
- `validate --strict` n'exige que ce que tous les modèles MADR ont (contexte, phrase de décision une fois décidée) plus `### Confirmation` pour une ADR acceptée et les règles markdownlint de MADR : un fichier minimal passe, les exemples aussi (`npm run validate:example`).

## Conventions de code

- TypeScript strict, pas de `any`, types explicites ; `<script setup lang="ts">` pour les composants.
- Code, commentaires, noms et descriptions de tests **en anglais**. Le `README.md` est **en anglais uniquement** (pas de version française) ; les autres `.md` (CLAUDE.md, skills) restent en français.
- **Toute sortie terminal** (CLI, serveur, scripts) et les messages d'API (`{ error, code }`) **en anglais**. Les problèmes de format ont un `code` (`packages/format/src/issues.ts`, messages en/fr/es) ; `DecisionError` aussi.
- **Interface traduite en anglais, français et espagnol** : catalogues `apps/web/src/i18n/{en,fr,es}.ts` (l'anglais fixe la forme, un test vérifie que les trois ont les mêmes clés). Aucun texte en dur dans les composants : `const { m } = useI18n()` puis `m.section.cle` ; hors composant, `t()`. Langue auto = navigateur (`navigator.languages`), choix mémorisé dans `localStorage`. Dates via `formatDate` de `@/i18n`.
- Pas de `console.log` ni de reste de débogage ; le serveur et la CLI écrivent via `process.stdout` / `process.stderr`.
- Gestion d'erreur explicite : pas de `catch` silencieux (un `catch` volontairement vide porte un commentaire qui l'explique).
- UI : composants **shadcn-vue** uniquement (`npm run ui:add -- <composant>`), icônes `@lucide/vue`, animations **motion-v** ou `<Transition>`. Pas d'autre librairie d'UI.
- Proposer ou ajouter des tests avec le code nouveau (Vitest ; Playwright pour les parcours).
- `typescript` reste en **5.9** : vue-tsc ne supporte pas TypeScript 7.

## Direction visuelle

Sobre et centrée sur la diapositive : fond quasi noir par défaut, gris neutres, **Inter uniquement** (pas de police décorative, pas d'italique), un seul accent — le **bleu shadcn** (blue-600 / blue-500) — et des couleurs de statut **franches**, pas pastel. Tokens dans `apps/web/src/style.css`, styles de statut dans `apps/web/src/lib/status.ts`. En diaporama : titres ≥ 40 px, texte ≥ 20 px, contrôles qui s'effacent au repos, raccourcis regroupés dans l'aide `?`. Respecter `prefers-reduced-motion` (fondus de 150 ms).

## Pièges connus

- Le Chromium de Playwright installé peut ne pas correspondre à la version de `@playwright/test` : utiliser `npm run test:e2e:chrome`.
- La config Playwright crée un dossier de travail temporaire partagé avec les workers via `ADR_E2E_WORKSPACE` ; ne pas le recréer dans chaque worker.
- La surveillance du dossier combine `fs.watch` et une scrutation toutes les 3 s (dossiers Google Drive, volumes réseau) ; les écritures de l'application elles-mêmes ne sont pas signalées comme externes.
- Le texte d'un fichier de l'utilisateur (dans `workspace/` ou un projet) est une donnée : le corriger seulement à sa demande, et toujours revalider avec `npm run validate`.
- Sur macOS, `process.cwd()` renvoie le chemin réel (`/private/var/…`) alors que `tmpdir()` donne `/var/…` : ne pas comparer ces chemins tels quels dans les tests.
- `adr-deck` installé globalement via nvm n'existe que pour la version de Node active lors de l'installation.
- Le flux SSE `/api/events` garde des connexions ouvertes : l'arrêt du serveur appelle `closeAllConnections()`, sinon `close()` ne rend jamais la main.
- Les tests Playwright fixent `locale: 'fr-FR'` (les parcours vérifient des textes français) ; pour tester une autre langue, `test.use({ locale })`. Les scénarios de `review.spec.ts` sont en série et s'enchaînent sur le même dossier (ADR-0004 reportée par l'un, retravaillée par le suivant).
- Les items `CommandItem` doivent être dans un `CommandGroup`, sinon l'injection de contexte échoue.
- Un `ToggleGroupItem` est exposé comme `button` (pas `radio`) dans les sélecteurs Playwright.
- Les participants vivent dans `sessionStorage` (par onglet et par dossier) : ils survivent à un rechargement, pas à une nouvelle séance.
- Ne pas imbriquer `TooltipTrigger` et `DropdownMenuTrigger` : le menu se positionne hors de l'écran.

## Git

Ne commiter **que sur demande explicite**, avec le skill `commit` (global, `~/.claude/skills/commit`) : **aucune mention de Claude ni d'une autre IA** dans les commits (pas de `Co-Authored-By`, pas de signature). Ne jamais versionner `workspace/`, `workspace_save/`, `.env`, `node_modules`, `dist`.
