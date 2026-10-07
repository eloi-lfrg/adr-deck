# adr-deck

A focused, well-paced review of ADRs (*Architecture Decision Records*): **one ADR per slide, one decision per click**, written straight into your project's [MADR](https://adr.github.io/madr/) files.

It is a **local** web app, designed to be driven by one person sharing their screen during a meeting: run `adr-deck` in a project and the browser opens on its ADRs. No database: **the `NNNN-title.md` files are the single source of truth**.

ADRs are widely recommended and rarely kept alive: they get written, then nobody reads them, and most are filed straight as `accepted` without a real discussion. adr-deck turns them into a meeting: the team reads each proposed decision together and settles it — accept, reject, defer, or send it back for rework with actions — with the participants recorded, and accepted decisions are superseded or deprecated instead of being rewritten. The full user guide (in French), with the rationale, every screen and a suggested method, is in [docs/GUIDE.md](docs/GUIDE.md).

## Contents

- [Installation](#installation)
- [Usage](#usage)
- [Languages](#languages)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [The MADR format](#the-madr-format)
- [Creating ADRs](#creating-adrs)
- [Exporting to and importing from `.docx`](#exporting-to-and-importing-from-docx)
- [Development](#development)
- [npm scripts](#npm-scripts)
- [Architecture](#architecture)
- [Design](#design)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Installation

Requirement: Node.js ≥ 22.22 (`nvm install 22.22 && nvm use`).

```sh
npm install
npm run install:global     # builds the package, packs it and installs it with npm install -g
```

The `adr-deck` command is then available everywhere. The installation is a standalone copy (installed from the tarball): it does not depend on this repository. To update, run `npm run install:global` again; to uninstall, `npm run uninstall:global`.

With nvm, global packages belong to one Node version: `adr-deck` is available as long as Node 22.22 (or the version active at install time) is in use.

## Usage

```sh
cd ~/workspace/my-project
adr-deck                       # local server + opens the browser
```

| Command | Purpose |
| --- | --- |
| `adr-deck [review] [dir]` | Review the ADRs of the directory (default: current directory) |
| `adr-deck timeline [dir]` | Same app, opened on the timeline of the ADRs |
| `adr-deck serve [dir]` | Share the timeline **read-only** on the local network (listens on `0.0.0.0`, does not open the browser) |
| `adr-deck add [dir]` | Create a new ADR interactively (see [Creating ADRs](#creating-adrs)) |
| `adr-deck export [output.docx]` | `.docx` of every ADR (default: `<project>-decisions.docx` in the current directory; English labels, or `--lang fr` / `--lang es`) |
| `adr-deck import <file.docx> [dir]` | Turn a `.docx` exported by adr-deck (possibly edited in Word) back into MADR files |
| `adr-deck validate [path…]` | Check MADR files or directories; exit code 1 on error (`--strict`: MADR template and markdownlint rules too) |
| `adr-deck --help` / `--version` | Help / version |

Options: `-p, --port <port>` (default 8787, or the next free one; `ADR_PORT`), `--host <host>` (default 127.0.0.1, 0.0.0.0 for `serve`; `ADR_HOST`), `--no-open` (`serve`: `--open` to open it), `--read-only` (`review`, `timeline`: refuse every change; always on for `serve`), `-d, --dir <dir>` (starting directory for `export`, `import` and `validate`), `-o, --output <file>`, `-l, --lang <en|fr|es>` (language of the `.docx` labels), `-f, --force` (`import`: overwrite ADRs whose content changed), `--strict` (`validate`), `--minimal` and `-c, --category <dir>` (`add`).

All terminal output (CLI, server) is in English. `Ctrl+C` stops the server immediately, even with the browser open; a second `Ctrl+C` forces the exit.

### Where ADRs are looked for

ADRs are `NNNN-title.md` files (a number of at least 3 digits). The first directory that contains some is used:

1. the launch directory (its own files);
2. `docs/decisions` (MADR convention), `docs/adr`, `doc/adr`, `docs/architecture/decisions`, `adr`, `decisions`, category folders included.

Inside it, **category folders** are read two levels deep, as MADR suggests for large projects (`backend/0012-cache.md`, `ui/forms/0013-x.md`); hidden folders and `node_modules`, `dist`, `build`, `target`, `vendor` are skipped. Numbers stay unique across folders (a duplicate is an error). The grid filters by category and each card shows its folder. The selected directory is shown at startup and at the top of the grid. Other `.md` files (`README.md`, `template.md`…) are ignored.

### Review flow

1. **Grid** — every ADR of the directory: status tabs with counters, full-text search, category and tag filters, sorting (number, date newest first, status). Clicking a card opens the slideshow on that ADR. The dot in the corner of a card adds it to a selection. Unreadable files are listed in a collapsible notice (file, line, message) and left out of the review.
2. **Participants** (optional) — note who attends and whether they decide or are consulted (from the grid, the slideshow or `Ctrl+K`; people already named in the ADRs are one click away). Each decision adds them to `decision-makers` and `consulted`, without duplicates and keeping the list style of the file. The list lasts for the browser tab.
3. **Slideshow** — “Start the review” (or `R`) switches to full screen. For each ADR: read the context, the decision drivers, the open actions, the consequences and the confirmation, compare the options (Good, Neutral, Bad), then **Accept**, **Reject**, **Defer** (optional next review date) or **Rework** (`W`: one action per line), with an optional comment. The next slide comes after 1.2 s (auto advance can be turned off); the file is saved in the background.
4. **Summary** — at the end: session counters (accepted, rejected, deferred, to rework), decisions made with their comments and actions, `.docx` export.

### Timeline

`adr-deck timeline` (or `T` from the grid, or the `Ctrl+K` palette) shows every ADR on a vertical timeline, to read the history of the decisions rather than to decide. ADRs are placed at their decision date (or else their front matter `date`), grouped by year and month; undated ones come last. Each entry shows its status, the chosen (or recommended) options and the justification; **Read** (`Enter`) unfolds the whole ADR — context, drivers, options with their pros and cons, outcome details, people involved — and opens it in the slideshow if needed. Status filters, newest first by default (or oldest first), expand all (`A`). The spine fills up as you scroll; links between superseding and superseded ADRs move along the timeline. `/timeline?at=ADR-0007` opens on an ADR.

### Sharing read-only

`adr-deck serve [dir]` shares the decisions on the local network: it listens on every interface (`--host` to restrict it), prints the local and network addresses, opens on the timeline and refuses every write (`403`). The UI hides decisions, editing and participants and shows “Read only”; the slideshow still works to present decisions. `--read-only` does the same for `review` and `timeline`. There is no authentication: use it on a trusted network.

### Slideshow modes

| Mode | Content | Behaviour |
| --- | --- | --- |
| Proposed | `proposed` ADRs (+ `deferred`, enabled by default) | Editable slides |
| Decided | `accepted`, `rejected`, `superseded`, `deprecated` ADRs | Read only, “Edit the decision” button (`M`) |
| All | Every ADR | Editable when not decided |
| Selection | ADRs ticked in the grid, or ADRs visible after filtering (click on a card) | Same |

The list is frozen at launch: deciding an ADR does not remove it from the slideshow.

### Decisions

- **Accept** requires at least one selected option (click on the card or keys `1` to `9`). Several options can be chosen.
- A `proposed` ADR whose “Decision Outcome” already names an option (`Chosen option: "…"`) arrives with that option preselected and its justification in the comment.
- **Reject**: no option chosen. **Defer**: optional “Next review” date (calendar icon).
- **Rework** — the AWS “stays proposed, with action items” outcome: the ADR keeps `status: proposed` (today's date) and its recommendation; the actions are added as unchecked items under `### Actions` in « More Information » and show on its slide until they are checked (`* [x]`) in the file.
- An accepted ADR without `### Confirmation` is flagged “no confirmation” on its slide.
- The **date** is set automatically (today, Europe/Paris time zone).
- **`Ctrl+Z`** undoes the last decision of the session: the file gets back **exactly** its previous content.

### Superseding and deprecating

A decided ADR is never rewritten: on an accepted ADR, **Supersede** (pick the new ADR, optional reason) and **Deprecate** keep its outcome sentence and decision date, set `status: superseded by ADR-0015` or `deprecated`, and add a dated note to « More Information » (“Superseded by ADR-0015 on 2026-10-07, because …”). Superseding also notes “Supersedes ADR-0011 (title).” in the new ADR; both files change in one undoable step.

An ADR with `superseded by ADR-0008` shows a link to its replacement, with its title:

- on its card in the grid (“superseded by ADR-0008 ↗”);
- in the bottom bar of its slide, and with the **`L`** key;
- the replacement shows “supersedes ADR-0007” in return, with a link.

If the replacement is not in the current slideshow list, it opens in “All” mode. A replacement missing from the directory is reported as a warning.

### Presentation mode

In the slideshow, controls and cursor fade out when the mouse rests for 2 s; they come back on the slightest movement or when nearing the top of the screen. The whole review runs from the keyboard. Only a thin progress line stays visible at the top.

### Saving

The indicator at the top right shows *Saving…*, *Saved* or *Error* (with *Retry*). A decision reaches its file in less than a second. When a file is modified outside the app (editor, `git pull`), the UI hot-reloads it without losing pending decisions; an added or removed file appears in or disappears from the grid.

Before each write, the previous version is backed up (last 10 per file) in `~/.adr-deck/backups/<directory>-<hash>/`, outside the repository.

## Languages

The UI is available in **English, French and Spanish**. By default it follows the browser language (the first supported language among its preferences, English otherwise) and switches on its own when the browser language changes.

The language button in the header (文A icon and `EN` / `FR` / `ES` code) lets you pick a fixed language or go back to “Automatic”. The choice is remembered in the browser. The `Ctrl+K` palette also offers “Change language”.

The UI language also applies to format messages (grid notice) and to the labels of the `.docx` exported from the app. ADR content is never translated; the sentence written in “Decision Outcome” follows the language of the file headings (English or French).

## Keyboard shortcuts

`?` shows the shortcuts help in the slideshow and the timeline.

| Key | Action |
| --- | --- |
| `←` / `→` | Previous / next ADR |
| `1` to `9` | Select / unselect option P1 to P9 |
| `V` / `X` / `P` / `W` | Accept / Reject / Defer / Rework |
| `C` | Focus the comment (`Enter` or `Esc` to leave) |
| `M` | Edit an existing decision |
| `L` | Go to the ADR that supersedes the current one |
| `S` | Thumbnail contents |
| `G` | Back to the grid |
| `F` | Full screen |
| `Ctrl+Z` / `⌘Z` | Undo the last decision of the session |
| `Ctrl+K` / `⌘K` | Search and actions |
| `?` | Shortcuts help (slideshow) |
| `Esc` | Close the panel or leave the slideshow |
| `R` (grid) | Start the review |
| `/` (grid) | Search |
| `T` (grid) | Timeline |
| `↑` / `↓` or `J` / `K` (timeline) | Previous / next ADR |
| `Enter` (timeline) | Read / collapse the ADR |
| `A` (timeline) | Expand / collapse all |
| `E` (summary) | Export to `.docx` |

## The MADR format

**One file = one ADR**, named `NNNN-title.md`; the displayed ID comes from the number (`0007-cache.md` → `ADR-0007`). The template is in `templates/madr.md`, and examples covering every status are in `examples/decisions/`.

```markdown
---
status: accepted
date: 2026-10-05
decision-makers: Eloi, Marie
tags: [backend, infra]
---

# Message queue choice

## Context and Problem Statement

Asynchronous jobs currently run as cron tasks.

## Decision Drivers

* Retry on failure

## Considered Options

* PostgreSQL as a queue (pg-boss)
* RabbitMQ

## Decision Outcome

Chosen option: "PostgreSQL as a queue (pg-boss)", because it is enough for our volumes.

### Consequences

* Good, because no extra infrastructure.

## Pros and Cons of the Options

### PostgreSQL as a queue (pg-boss)

Reuses the existing database.

* Good, because no extra infrastructure
* Bad, because limited throughput

### RabbitMQ

* Good, because throughput, rich routing
```

### Reading

| Element | Use |
| --- | --- |
| Front matter | `status`, `date`, `decision-makers` (or MADR 3 `deciders`), `consulted`, `informed` (list or comma-separated text), plus the `tags` and `next-review` extensions. Any other key is kept as written. No front matter: `proposed` ADR. |
| `# Title` | Slide title (required). |
| `## Context and Problem Statement` | Displayed context. |
| `## Decision Drivers` | Decision drivers, shown below the context. |
| `## Considered Options` | One option per bullet → cards P1, P2… |
| `## Pros and Cons of the Options` | `### <option>` subsections matched by title: description, `Good, because …` (pro), `Neutral, because …`, `Bad, because …` (con). |
| `## Decision Outcome` | Lead sentence `Chosen option: "A", because …` → chosen option and comment (several options: `Chosen options: "A" and "B"`). For a `proposed` ADR, the named option is a recommendation, preselected in the slideshow. `### Consequences` and `### Confirmation` are shown on the slide; every subsection is kept. |
| `## More Information` and any other `##` section | Kept, included in the `.docx` export and read back on import. `### Actions` in « More Information » holds the rework actions. |

Common French headings are accepted as well (`Contexte et problématique`, `Options envisagées`, `Décision`, `Avantages et inconvénients des options`, `Bon, car …` / `Neutre, car …` / `Mauvais, car …`). HTML comments (`<!-- … -->`) are ignored.

### MADR compliance

adr-deck reads and writes [MADR 4](https://adr.github.io/madr/) (and reads MADR 3 `deciders`). Everything it writes stays within the format:

- standard metadata in the template order: `status`, `date`, `decision-makers`, `consulted`, `informed`;
- standard section headings and sentences: `Chosen option: "…", because …`, `* Good, because …`, `* Neutral, because …`, `* Bad, because …`;
- `NNNN-title-with-dashes.md` file names, optionally in category folders; IDs (`ADR-0007`) come from the number;
- the full template (`templates/madr.md`, with `### Consequences` and `### Confirmation`) and the minimal one (`templates/madr-minimal.md`); `validate --strict` accepts a minimal file and only asks for what every MADR template has.

Three conventions go beyond the template, as MADR allows (its metadata is optional and its status list is open, “proposed | rejected | accepted | deprecated | … | superseded by ADR-0123”):

| Extension | Why |
| --- | --- |
| `status: deferred` | MADR has no status for a postponed decision |
| `next-review: YYYY-MM-DD` | Next review date of a deferred decision; removed once decided |
| `tags: [a, b]` | Grid filters; kept as written, never invented by the app |

French section headings are read for files written that way, and kept when such a file is rewritten; new files use the English MADR headings.

### Statuses

| MADR `status` | In the app | Written by |
| --- | --- | --- |
| `proposed` (or missing, `draft`) | Proposed | Rework |
| `accepted` | Accepted | Accept |
| `rejected` | Rejected | Reject |
| `deferred` (+ `next-review`) | Deferred | Defer |
| `superseded by ADR-0012` | Superseded | Supersede |
| `deprecated` | Deprecated | Deprecate |

An unknown status is read as “proposed”, with a warning.

### Writing

Every change is a targeted edit:

| Operation | Front matter | Decision Outcome | More Information |
| --- | --- | --- | --- |
| Accept, Reject, Defer | `status`, today's `date`, `next-review` (defer), participants | Lead sentence rewritten; subsections kept | — |
| Rework | `status: proposed`, today's `date`, participants | Unchanged | Actions added under `### Actions` |
| Supersede | `status: superseded by ADR-x`, participants; date unchanged | Unchanged | Dated note (and “Supersedes …” in the new ADR) |
| Deprecate | `status: deprecated`, participants; date unchanged | Unchanged | Dated note |

Missing keys and sections are created at their MADR place; other keys, their order and their quoting are kept. Participants are merged into `decision-makers` (or `deciders`) and `consulted`, keeping the names already there and the list style. The sentence is written in the language of the file headings: `Chosen option: "A", because …` or `Option retenue : « A », car …`.

The rest of the file is kept byte for byte, CRLF line endings included. Undoing restores every part as it was.

### Errors

`adr-deck validate` (or `npm run validate -- <path>`) reports problems with their line. **Errors** (file left out of the review): missing `#` title, invalid YAML front matter, duplicate number (across category folders). **Warnings**: unknown status, no considered option (cannot be accepted), chosen option missing from the options, replacement ADR not found. The server refuses to write content with errors.

`adr-deck validate --strict` also checks what every MADR template has — a context, and an outcome sentence once decided —, a `### Confirmation` for accepted ADRs, and the markdownlint rules of the MADR configuration (`.markdownlint.yml`: defaults without MD013 and MD024; MD001, MD004, MD009, MD010, MD012, MD018, MD019, MD022, MD023, MD025, MD031, MD032, MD034, MD040, MD041, MD047 are checked). Warnings then fail too: use it in CI. Optional sections are never required.

## Creating ADRs

- **Interactively**: `adr-deck add` asks every field in the terminal — title and context, then **lists the existing ADRs on a close subject** (keywords of the title and context, weighted by how rare they are in the directory) with their status and asks whether to go on, so that a settled debate is not reopened unknowingly; then the category folder when the directory has some (or `--category backend`), decision drivers, options with their description and Good, Neutral and Bad arguments, status (`proposed` by default), chosen or recommended options, justification, consequences and confirmation, decision makers, consulted, informed, tags, more information and, last, the number of the ADR it supersedes (empty: none). `--minimal` only asks the fields of the MADR minimal template (context, options, outcome, consequences). The file gets the next number across every folder, today's date (Europe/Paris) and the heading language of most ADRs of the directory (English otherwise). A superseded ADR gets `status: superseded by ADR-NNNN` and a dated note; the new one says so in « More Information ». Nothing is written before the final confirmation.
- **By hand**: copy `templates/madr.md` (or `templates/madr-minimal.md`) to `docs/decisions/NNNN-title.md`.
- **From a `.docx` exported by adr-deck**: `adr-deck import review.docx` (see [Import](#import)).
- **From any source** (meeting notes, PDF, Word, discussion thread): the repository's Claude Code skill `adr-extract` produces validated MADR files, without making anything up:

  ```text
  /adr-extract ~/Documents/committee-minutes.pdf docs/decisions
  ```

## Exporting to and importing from `.docx`

### Export

From the grid (export icon), the summary (`E`), the `Ctrl+K` palette (labels in the UI language), or from the command line:

```sh
adr-deck export                 # in the project directory
adr-deck export ~/Desktop/review.docx --lang fr
```

The `.docx` is a **view** of the MADR files: cover page (project name, directory, date), a summary table of every ADR with a coloured status, then one section per ADR. It carries everything a MADR file holds — file path (category folder included), metadata (`status`, `date`, `decision-makers`, `consulted`, `informed`, tags and any other front matter key), context, decision drivers, options with their description and Good, Neutral and Bad arguments, decision (chosen or recommended options, justification, next review, superseding ADR), outcome subsections such as `### Consequences`, other sections and « More Information » — so that it can be read back. From the app, the file is downloaded; nothing is written in the ADR directory.

### Import

A `.docx` exported by adr-deck can be edited in Word or Google Docs (texts, statuses, options, decision tables) and turned back into MADR files:

```sh
adr-deck import review.docx                 # into the ADR directory of the current directory (docs/decisions by default)
adr-deck import review.docx docs/decisions  # into a given directory
adr-deck import review.docx --force         # also overwrite ADRs whose content changed
```

| Situation | Result |
| --- | --- |
| ADR not in the directory | File created, named after the `File` row (`NNNN-title.md`, in its category folder) |
| ADR unchanged | File left untouched, even if its layout differs from the generated one |
| ADR changed | Skipped with a message; rewritten with `--force` |

Imported files are canonical MADR: front matter in the order of the MADR template, standard section headings (English, or French when the existing file used French headings), `Chosen option: "…", because …`, `* Good, because …` / `* Bad, because …`. Labels in English, French or Spanish are recognised. Exporting then importing gives back the same ADRs; only the language hint of code blocks (```` ```ts ````) is lost, as Word has no place for it. A document that does not follow the export structure is refused with an explanation.

## Development

```sh
nvm use            # Node 22.22 (read from .nvmrc)
npm install
npm run dev        # API server (127.0.0.1:8787) + Vite front end (localhost:5173)
```

In development, the server reads `./workspace` (ignored by git); when it holds no MADR file, the examples of `examples/decisions/` are copied into it. To work on another directory:

```sh
ADR_WORKSPACE=~/workspace/my-project npm run dev
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADR_WORKSPACE` | `./workspace` | Directory where the ADR lookup starts (`npm run dev`) |
| `ADR_TITLE` | directory name | Displayed name and `.docx` cover page |
| `ADR_PORT` | `8787` | Local server port (the Vite proxy follows it) |
| `ADR_HOST` | `127.0.0.1` | Listening interface |
| `ADR_WEB_PORT` | `5173` | Vite front end port in development |
| `ADR_READ_ONLY` | — | `1`: refuse every write, as `adr-deck serve` does |

### Conventions

- Strict TypeScript everywhere, no `any`; Vue components in `<script setup lang="ts">`.
- Code, comments, tests, documentation and **all terminal output or API messages** in English; UI translated (English, French, Spanish).
- UI components: shadcn-vue only (`npm run ui:add -- <component>`), `@lucide/vue` icons.
- No database: all persistent data lives in the MADR files.
- Every useful script is declared in the root `package.json`.

### Tests

| Package | Coverage |
| --- | --- |
| `@adr/format` | MADR reading (English, French, no front matter, code blocks, Neutral arguments, outcome subsections), statuses, decisions, rework, supersede and deprecate, participants, byte-for-byte undo on every example, category folders, collection (order, duplicates, supersede links), MADR writing, strict lint, similar ADRs |
| `@adr/convert` | `.docx` export, en/fr/es labels; export then import gives back every example and a rich ADR (markdown, code, outcome subsections, Neutral arguments, metadata, category folder) |
| `@adr/server` | Directory lookup (category folders), API, nested paths and traversal, revision conflicts, backups, directory watching, read-only mode |
| `@adr/web` | Per-file write queue and replay on conflict, rework, two-file supersede and its undo, participants, read-only, timeline order and grouping, Markdown rendering, i18n (detection, complete catalogs, dates); e2e: full keyboard review, participants and rework, consequences, deprecate and supersede with undo, read-only, timeline, hot reload, navigation to the replacement ADR, language switch |
| `adr-deck` | CLI arguments (`serve`, `--read-only`, `--strict`, `--minimal`, `--category`), `add` questions (scripted answers, minimal template, similar ADRs, category); `npm run test:package` installs the tarball and tests `review`, `serve`, `validate` (`--strict`, category folders), `export` and `import` |

Before shipping: `npm run check`, `npm run test:e2e:chrome` for any UI change, `npm run test:package` for the CLI.

## npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Front end (Vite) + server (Hono) in development mode |
| `npm run dev:server` / `npm run dev:web` | Only one of them |
| `npm run build` | Production build of the front end |
| `npm start` | Front end build, then a single server on <http://127.0.0.1:8787> |
| `npm test` | Vitest tests of every package |
| `npm run typecheck` | Strict TypeScript check of every package |
| `npm run check` | `typecheck` then `test` |
| `npm run validate -- <path>` | Check MADR files or directories (paths relative to the repository root) |
| `npm run validate:strict -- <path>` | Same, with the MADR template and markdownlint rules |
| `npm run validate:example` | Check `examples/decisions` (strict) |
| `npm run serve -- <dir>` | Share a directory read-only on the local network |
| `npm run export -- [output.docx] [--dir <dir>] [--lang <en\|fr\|es>]` | `.docx` export |
| `npm run import -- <file.docx> [dir] [--force]` | `.docx` → MADR files |
| `npm run add -- [dir] [--minimal] [--category <dir>]` | Create an ADR interactively |
| `npm run install:global` | Build and install `adr-deck` globally |
| `npm run uninstall:global` | Uninstall `adr-deck` |
| `npm run build:package` | Build the `adr-deck` npm package (front end + bundled CLI) |
| `npm run test:package` | Test the tarball installed in a temporary project |
| `npm run pack:package` | Produce the `adr-deck-<version>.tgz` tarball |
| `npm run test:e2e:install` | Download Playwright's Chromium (once) |
| `npm run test:e2e` / `test:e2e:chrome` | Playwright scenarios (Playwright's Chromium / installed Chrome) |
| `npm run ui:add -- <component>` | Add a shadcn-vue component to the front end |
| `npm run clean` | Remove builds and test reports |

## Architecture

```text
adr-deck/
├── apps/
│   ├── web/              Vue 3, Vite, strict TypeScript, Pinia, Vue Router, shadcn-vue, Tailwind v4, motion-v, en/fr/es i18n
│   └── server/           Node 22 + Hono: directory lookup, file API, atomic writes, backups, SSE
├── packages/
│   ├── format/           @adr/format: MADR reading and writing, statuses, targeted edits (decision, undo), collection
│   ├── convert/          @adr/convert: .docx export and import
│   └── adr-deck/         npm package: “adr-deck” CLI (review, add, export, import, validate), esbuild bundle, tarball test
├── examples/decisions/   15 MADR ADRs covering every status
├── templates/           MADR templates: full (madr.md) and minimal (madr-minimal.md)
├── docs/                user guide (French) and its screenshots
├── .claude/skills/       adr-extract skill
└── workspace/            development directory (ignored by git)
```

Internal packages are consumed directly as TypeScript; only `adr-deck` is compiled (esbuild), at `npm pack` time.

### Save flow

1. Each decision is a replayable **operation** (`decide`, `undo`) applied to the text of the file concerned; the UI is optimistic.
2. A write queue batches changes (400 ms debounce) and sends each modified file with its known revision (`If-Match`, SHA-256 hash of the content).
3. The server checks that the file has not changed, backs up the current version, writes to a temporary file then renames it (atomic write).
4. On conflict (`409`), the app takes the file from disk, **replays the pending operations** and notifies the user.
5. Any external modification is signalled over SSE: the file is hot-reloaded and the operations not yet saved are replayed.

### Local API

| Method | Route | Use |
| --- | --- | --- |
| GET | `/api/health` | Server status, ADR directory, `readOnly` |
| GET | `/api/adrs` | Project name, directory, `readOnly`, and every MADR file (path, content, revision) |
| GET | `/api/adrs/:path` | Content and revision of one file (`0007-x.md` or `backend/0007-x.md`) |
| PUT | `/api/adrs/:path` | Write (`If-Match` required; `409` on conflict, `422` on invalid content, `403` on a read-only server) |
| GET | `/api/export/docx?lang=fr` | `.docx` of every readable ADR (labels in `en`, `fr` or `es`) |
| GET | `/api/events` | SSE stream: `changed` (file modified elsewhere), `files` (file added or removed) |

Errors return `{ error, code }`: `error` in English, `code` (`notFound`, `conflict`, `invalidContent`, `readOnly`…) translated by the UI. The server listens on `127.0.0.1` by default (`serve`: every interface, read-only, no authentication — for a trusted network) and accepts `NNNN-title.md` paths only, at most two category folders deep, never outside the decisions directory.

## Design

- **Direction**: sober, centred on the slide. Near-black background by default (light theme and system setting available), neutral greys, no decoration.
- **Colours**: a single accent, shadcn blue (blue-600 / blue-500), and vivid status colours — sky blue (proposed), emerald green (accepted), red (rejected), amber (deferred), grey (superseded), violet (deprecated).
- **Typography**: Inter only. In the slideshow, titles ≥ 40 px and text ≥ 20 px, readable from 3 m.
- **Animations** (motion-v and `<Transition>`): slide between ADRs, staggered entrance, decision stamp, shared grid → slide transition. With `prefers-reduced-motion`, everything becomes a 150 ms fade.
- **Accessibility**: visible focus, ARIA labels on decisions and cards, AA contrast, full keyboard navigation.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `adr-deck: command not found` | Node version differs from the one used at install time (nvm): `nvm use 22.22`, or run `npm run install:global` again |
| “No MADR file found” | Launch from the ADR directory or the project root; check the `NNNN-title.md` naming |
| An ADR does not show up | It has errors: see the notice at the top of the grid or `adr-deck validate` |
| Port 8787 in use | `adr-deck` takes the next free one; with an explicit `--port`, pick another |
| “… modified elsewhere” | Expected: the file changed during the review; your pending decisions were reapplied |
| *Error* indicator | Server stopped or content refused: restart it, then *Retry* |
| `Executable doesn't exist` (Playwright) | `npm run test:e2e:install`, or `npm run test:e2e:chrome` |

## Known limitations

- The summary and the undo stack cover the current session: reloading the page resets them (the decisions themselves are in the files).
- No decision history in the file (plain MADR): git is the history, plus the dated notes of supersede and deprecate.
- Superseding needs the new ADR to exist (create it with `adr-deck add` first).
- Category folders are read two levels deep.
- No reading timer at the start of a session and no scheduled review of accepted ADRs (only deferred ones have a next review date).
- No real-time multi-user mode; `serve` shares read-only without authentication.
