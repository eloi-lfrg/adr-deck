import { describe, expect, it } from 'vitest';
import { ArgsError, DEFAULT_HOST, DEFAULT_PORT, parseCommand, SERVE_HOST } from '../src/args.ts';

const CWD = '/home/user/project';

describe('parseCommand', () => {
  it('reviews the current directory without arguments', () => {
    const expected = { kind: 'review', options: { root: CWD, port: DEFAULT_PORT, portExplicit: false, host: DEFAULT_HOST, open: true, view: 'grid', readOnly: false } };
    expect(parseCommand([], {}, CWD)).toEqual(expected);
    expect(parseCommand(['review'], {}, CWD)).toEqual(expected);
  });

  it('resolves a directory, a port and --no-open', () => {
    expect(parseCommand(['review', '../other', '--port', '9000', '--no-open'], {}, CWD)).toEqual({
      kind: 'review',
      options: { root: '/home/user/other', port: 9000, portExplicit: true, host: DEFAULT_HOST, open: false, view: 'grid', readOnly: false },
    });
    expect(parseCommand(['--dir', 'docs', '--no-open'], {}, CWD)).toMatchObject({ options: { root: '/home/user/project/docs', open: false } });
  });


  it('reads ADR_* variables when no flag is given and lets flags win', () => {
    expect(parseCommand(['review'], { ADR_PORT: '9100', ADR_HOST: '0.0.0.0' }, CWD)).toMatchObject({
      options: { port: 9100, portExplicit: true, host: '0.0.0.0' },
    });
    expect(parseCommand(['review', '-p', '9200', '--host', '::1'], { ADR_PORT: '9100', ADR_HOST: '0.0.0.0' }, CWD)).toMatchObject({
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
    expect(parseCommand(['validate'], {}, CWD)).toEqual({ kind: 'validate', paths: [CWD], strict: false });
    expect(parseCommand(['validate', '0001-a.md', 'docs', '--strict'], {}, CWD)).toEqual({
      kind: 'validate',
      paths: ['/home/user/project/0001-a.md', '/home/user/project/docs'],
      strict: true,
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

  it('opens the timeline with the same options as the review', () => {
    expect(parseCommand(['timeline'], {}, CWD)).toEqual({
      kind: 'review',
      options: { root: CWD, port: DEFAULT_PORT, portExplicit: false, host: DEFAULT_HOST, open: true, view: 'timeline', readOnly: false },
    });
    expect(parseCommand(['timeline', '--read-only'], {}, CWD)).toMatchObject({ options: { readOnly: true } });
    expect(parseCommand(['timeline', '../other', '--no-open'], {}, CWD)).toMatchObject({ options: { root: '/home/user/other', open: false, view: 'timeline' } });
    expect(() => parseCommand(['timeline', 'a', 'b'], {}, CWD)).toThrow(ArgsError);
  });

  it('parses add with an optional directory', () => {
    expect(parseCommand(['add'], {}, CWD)).toEqual({ kind: 'add', dir: null, minimal: false, category: null });
    expect(parseCommand(['add', 'docs/adr'], {}, CWD)).toEqual({ kind: 'add', dir: '/home/user/project/docs/adr', minimal: false, category: null });
    expect(parseCommand(['add', '--dir', 'docs', '--minimal', '-c', 'backend/'], {}, CWD)).toEqual({ kind: 'add', dir: '/home/user/project/docs', minimal: true, category: 'backend' });
    expect(() => parseCommand(['add', 'a', 'b'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['add', '--category', '../x'], {}, CWD)).toThrow(ArgsError);
  });

  it('shares the timeline read-only on every interface without opening the browser', () => {
    expect(parseCommand(['serve', 'docs'], {}, CWD)).toEqual({
      kind: 'review',
      options: { root: '/home/user/project/docs', port: DEFAULT_PORT, portExplicit: false, host: SERVE_HOST, open: false, view: 'timeline', readOnly: true },
    });
    expect(parseCommand(['serve', '--host', '127.0.0.1', '--open'], {}, CWD)).toMatchObject({ options: { host: '127.0.0.1', open: true, readOnly: true } });
  });

  it('recognises help and version', () => {
    expect(parseCommand(['--help'], {}, CWD)).toEqual({ kind: 'help' });
    expect(parseCommand(['-v'], {}, CWD)).toEqual({ kind: 'version' });
  });

  it.each([['--port', 'abc'], ['--port', '0'], ['--port', '70000']])('rejects an invalid port %s %s', (flag, value) => {
    expect(() => parseCommand(['review', flag, value], {}, CWD)).toThrow(ArgsError);
  });

  it('rejects unknown options, unknown commands and extra directories', () => {
    expect(() => parseCommand(['--nope'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['share'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['review', 'a', 'b'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['docs'], {}, CWD)).toThrow(ArgsError);
    expect(() => parseCommand(['--review'], {}, CWD)).toThrow(ArgsError);
  });
});
