import { describe, expect, it } from 'vitest';
import { ArgsError, DEFAULT_HOST, DEFAULT_PORT, parseCommand } from '../src/args.ts';

const CWD = '/home/user/project';

describe('parseCommand', () => {
  it('shows the help without arguments', () => {
    expect(parseCommand([], {}, CWD)).toEqual({ kind: 'help' });
  });

  it('reviews the current directory and opens the browser', () => {
    expect(parseCommand(['--review'], {}, CWD)).toEqual({
      kind: 'review',
      options: { root: CWD, port: DEFAULT_PORT, portExplicit: false, host: DEFAULT_HOST, open: true },
    });
  });

  it('resolves a directory, a port and --no-open', () => {
    expect(parseCommand(['-r', '../other', '--port', '9000', '--no-open'], {}, CWD)).toEqual({
      kind: 'review',
      options: { root: '/home/user/other', port: 9000, portExplicit: true, host: DEFAULT_HOST, open: false },
    });
  });

  it('reads ADR_* variables when no flag is given and lets flags win', () => {
    expect(parseCommand(['--review'], { ADR_PORT: '9100', ADR_HOST: '0.0.0.0' }, CWD)).toMatchObject({
      options: { port: 9100, portExplicit: true, host: '0.0.0.0' },
    });
    expect(parseCommand(['--review', '-p', '9200', '--host', '::1'], { ADR_PORT: '9100', ADR_HOST: '0.0.0.0' }, CWD)).toMatchObject({
      options: { port: 9200, host: '::1' },
    });
  });

  it('parses export with an optional output', () => {
    expect(parseCommand(['export'], {}, CWD)).toEqual({ kind: 'export', root: CWD, output: null, language: 'en' });
    expect(parseCommand(['export', 'out/adr.docx', '--dir', 'docs', '--lang', 'fr'], {}, CWD)).toEqual({
      kind: 'export',
      root: '/home/user/project/docs',
      output: '/home/user/project/out/adr.docx',
      language: 'fr',
    });
    expect(() => parseCommand(['export', '--lang', 'de'], {}, CWD)).toThrow(ArgsError);
  });

  it('parses validate with paths or the current directory', () => {
    expect(parseCommand(['validate'], {}, CWD)).toEqual({ kind: 'validate', paths: [CWD] });
    expect(parseCommand(['validate', '0001-a.md', 'docs'], {}, CWD)).toEqual({
      kind: 'validate',
      paths: ['/home/user/project/0001-a.md', '/home/user/project/docs'],
    });
  });

  it('parses import with an optional directory and --force', () => {
    expect(parseCommand(['import', 'review.docx'], {}, CWD)).toEqual({ kind: 'import', input: '/home/user/project/review.docx', dir: null, force: false });
    expect(parseCommand(['import', 'review.docx', 'docs/adr', '--force'], {}, CWD)).toEqual({
      kind: 'import',
      input: '/home/user/project/review.docx',
      dir: '/home/user/project/docs/adr',
      force: true,
    });
    expect(() => parseCommand(['import'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['import', 'a.docx', 'b', 'c'], {}, CWD)).toThrow(ArgsError);
  });

  it('recognises help and version', () => {
    expect(parseCommand(['--help'], {}, CWD)).toEqual({ kind: 'help' });
    expect(parseCommand(['-v'], {}, CWD)).toEqual({ kind: 'version' });
  });

  it.each([['--port', 'abc'], ['--port', '0'], ['--port', '70000']])('rejects an invalid port %s %s', (flag, value) => {
    expect(() => parseCommand(['--review', flag, value], {}, CWD)).toThrow(ArgsError);
  });

  it('rejects unknown options, unknown commands and extra directories', () => {
    expect(() => parseCommand(['--nope'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['serve'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['--review', 'a', 'b'], {}, CWD)).toThrow(ArgsError);
  });
});
