import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EXPORT_LANGUAGES, isExportLanguage, type ExportLanguage } from '@adr/convert';

export const DEFAULT_PORT = 8787;
export const DEFAULT_HOST = '127.0.0.1';

export interface ReviewOptions {
  /** Launch directory: MADR files are looked for here, then in docs/decisions, docs/adr… */
  root: string;
  port: number;
  /** False when the port is the default one: the next free port is then used if it is taken. */
  portExplicit: boolean;
  host: string;
  open: boolean;
}

export type Command =
  | { kind: 'review'; options: ReviewOptions }
  | { kind: 'export'; root: string; output: string | null; language: ExportLanguage }
  | { kind: 'validate'; paths: string[] }
  /** `dir`: null = the decisions directory of the current directory (see `cli.ts`). */
  | { kind: 'import'; input: string; dir: string | null; force: boolean }
  | { kind: 'help' }
  | { kind: 'version' };

export class ArgsError extends Error {}

function parsePort(raw: string, source: string): number {
  const port = Number(raw);
  if (!/^\d+$/u.test(raw) || !Number.isInteger(port) || port <= 0 || port > 65_535) throw new ArgsError(`Invalid port (${source}): ${raw}`);
  return port;
}

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      allowNegative: true,
      strict: true,
      options: {
        review: { type: 'boolean', short: 'r' },
        port: { type: 'string', short: 'p' },
        host: { type: 'string' },
        open: { type: 'boolean', default: true },
        dir: { type: 'string', short: 'd' },
        output: { type: 'string', short: 'o' },
        lang: { type: 'string', short: 'l' },
        force: { type: 'boolean', short: 'f' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    throw new ArgsError(error instanceof Error ? error.message : String(error));
  }
}

/** Turns the command line into a command; flags win over `ADR_*` variables, which win over defaults. */
export function parseCommand(argv: string[], env: NodeJS.ProcessEnv, cwd: string): Command {
  const { values, positionals } = parse(argv);
  if (values.help === true) return { kind: 'help' };
  if (values.version === true) return { kind: 'version' };
  const [subcommand, ...rest] = positionals;

  if (subcommand === 'export') {
    if (rest.length > 1) throw new ArgsError(`Expected a single output file, got: ${rest.join(' ')}`);
    const output = values.output ?? rest[0] ?? null;
    const language = values.lang ?? 'en';
    if (!isExportLanguage(language)) throw new ArgsError(`Invalid language: ${language} (expected ${EXPORT_LANGUAGES.join(', ')})`);
    return { kind: 'export', root: resolve(cwd, values.dir ?? '.'), output: output === null ? null : resolve(cwd, output), language };
  }
  if (subcommand === 'import') {
    const [input, target, ...extra] = rest;
    if (input === undefined) throw new ArgsError('Missing .docx file: adr-deck import <file.docx> [dir]');
    if (extra.length > 0) throw new ArgsError(`Expected a .docx file and at most one directory, got: ${rest.join(' ')}`);
    const dir = target ?? values.dir;
    return { kind: 'import', input: resolve(cwd, input), dir: dir === undefined ? null : resolve(cwd, dir), force: values.force === true };
  }
  if (subcommand === 'validate') {
    return { kind: 'validate', paths: (rest.length > 0 ? rest : [values.dir ?? '.']).map((path) => resolve(cwd, path)) };
  }
  if (values.review !== true) {
    if (subcommand !== undefined) throw new ArgsError(`Unknown command: ${subcommand}`);
    return { kind: 'help' };
  }
  if (positionals.length > 1) throw new ArgsError(`Expected a single directory, got: ${positionals.join(' ')}`);

  const fromFlag = values.port !== undefined ? parsePort(values.port, '--port') : null;
  const fromEnv = env['ADR_PORT'] ? parsePort(env['ADR_PORT'], 'ADR_PORT') : null;
  return {
    kind: 'review',
    options: {
      root: resolve(cwd, positionals[0] ?? values.dir ?? '.'),
      port: fromFlag ?? fromEnv ?? DEFAULT_PORT,
      portExplicit: fromFlag !== null || fromEnv !== null,
      host: values.host ?? (env['ADR_HOST'] || DEFAULT_HOST),
      open: values.open !== false,
    },
  };
}
