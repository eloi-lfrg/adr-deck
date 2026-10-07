import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasErrors, parseCollection, parseMadr, serializeMadr, type Adr } from '@adr/format';
import { askNewAdr, findAdrByNumber, isCalendarDate, majorityLanguage, splitList, type Choice, type Prompter } from '../src/add.ts';

const examplesDir = fileURLToPath(new URL('../../../examples/decisions/', import.meta.url));
const examples: Adr[] = parseCollection(
  readdirSync(examplesDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, content: readFileSync(`${examplesDir}${name}`, 'utf8') })),
).adrs;

interface Asked {
  kind: 'text' | 'select' | 'checkbox' | 'confirm' | 'notice';
  message: string;
  choices?: Choice<unknown>[];
}

/** Answers questions in order; text answers go through the question's validation like in the terminal. */
function scripted(answers: (string | number[] | boolean)[]): { prompter: Prompter; asked: Asked[] } {
  const asked: Asked[] = [];
  const next = (): string | number[] | boolean => {
    if (answers.length === 0) throw new Error(`No scripted answer for "${asked.at(-1)?.message ?? ''}"`);
    return answers.shift()!;
  };
  const prompter: Prompter = {
    text: async ({ message, required, validate }) => {
      asked.push({ kind: 'text', message });
      const answer = next();
      if (typeof answer !== 'string') throw new Error(`Expected a text answer for "${message}"`);
      if (required === true && answer.trim() === '') throw new Error(`"${message}" is required`);
      const verdict = validate?.(answer) ?? true;
      if (verdict !== true) throw new Error(verdict);
      return answer;
    },
    select: async <T extends string>({ message, choices }: { message: string; choices: Choice<T>[]; default: T }) => {
      asked.push({ kind: 'select', message, choices });
      const answer = next();
      const choice = choices.find((candidate) => candidate.name === answer);
      if (choice === undefined || choice.disabled !== undefined) throw new Error(`Cannot pick "${String(answer)}"`);
      return choice.value;
    },
    checkbox: async ({ message, choices, required }) => {
      asked.push({ kind: 'checkbox', message, choices });
      const answer = next();
      if (!Array.isArray(answer)) throw new Error(`Expected a checkbox answer for "${message}"`);
      if (required && answer.length === 0) throw new Error(`"${message}" is required`);
      return answer;
    },
    confirm: async ({ message }) => {
      asked.push({ kind: 'confirm', message });
      const answer = next();
      if (typeof answer !== 'boolean') throw new Error(`Expected a yes/no answer for "${message}"`);
      return answer;
    },
    notice: (message) => {
      asked.push({ kind: 'notice', message });
    },
  };
  return { prompter, asked };
}

const context = { adrs: examples, language: 'en' as const, today: '2026-10-07' };

describe('askNewAdr', () => {
  it('writes a proposed ADR by default and reads it back', async () => {
    const { prompter, asked } = scripted([
      'Use PostgreSQL',
      'We need a relational database.',
      'Cost',
      'Operations',
      '',
      'PostgreSQL',
      'Managed by the cloud provider.',
      'mature',
      '',
      'open source',
      '',
      'cost',
      '',
      'MySQL',
      '',
      '',
      '',
      '',
      '',
      'proposed',
      [0],
      '',
      'one engine',
      '',
      '',
      'Integration tests run on PostgreSQL',
      'Alice, Bob',
      '',
      'Team',
      'backend, data',
      '',
      '',
    ]);
    const created = (await askNewAdr(prompter, context, 10))!;

    expect(created).toMatchObject({ id: 'ADR-0010', fileName: '0010-use-postgresql.md', supersedes: null });
    const select = asked.find((question) => question.kind === 'select');
    expect(select?.choices?.map((choice) => choice.name)).toEqual(['proposed', 'accepted', 'rejected', 'deferred', 'deprecated']);

    const { adr, issues } = parseMadr(serializeMadr(created.draft), created.fileName);
    expect(hasErrors(issues)).toBe(false);
    expect(adr).toMatchObject({
      id: 'ADR-0010',
      title: 'Use PostgreSQL',
      status: 'à décider',
      date: '2026-10-07',
      deciders: ['Alice', 'Bob'],
      informed: ['Team'],
      tags: ['backend', 'data'],
      context: 'We need a relational database.',
      drivers: '* Cost\n* Operations',
      recommended: ['P1'],
      decision: null,
    });
    expect(adr?.propositions).toMatchObject([
      { title: 'PostgreSQL', body: 'Managed by the cloud provider.', pros: ['mature'], neutral: ['open source'], cons: ['cost'] },
      { title: 'MySQL', body: '', pros: [], cons: [], neutral: [] },
    ]);
    expect(adr?.outcomeDetails).toBe('### Consequences\n\n* Good, because one engine\n\n### Confirmation\n\nIntegration tests run on PostgreSQL');
  });

  it('requires a chosen option to accept and records the justification', async () => {
    const { prompter } = scripted(['Use Vue', 'Front end framework.', '', 'Vue', '', '', '', '', 'React', '', '', '', '', '', 'accepted', [1], 'the team knows it', '', '', '', '', '', '', '', '', '']);
    const created = (await askNewAdr(prompter, context, 11))!;
    const { adr } = parseMadr(serializeMadr(created.draft), created.fileName);
    expect(adr?.status).toBe('validée');
    expect(adr?.decision).toMatchObject({ retained: ['P2'], comment: 'the team knows it' });
  });

  it('does not offer accepted without options', async () => {
    const { prompter } = scripted(['No options', 'Context.', '', '', 'accepted']);
    await expect(askNewAdr(prompter, context, 12)).rejects.toThrow('Cannot pick "accepted"');
  });

  it('asks the next review of a deferred ADR and validates it', async () => {
    const answers = (date: string): string[] => ['Later', 'Context.', '', '', 'deferred', date, '', '', '', '', '', '', ''];
    await expect(askNewAdr(scripted(answers('2026-02-30')).prompter, context, 13)).rejects.toThrow('YYYY-MM-DD');
    const created = (await askNewAdr(scripted(answers('2026-11-15')).prompter, context, 13))!;
    const { adr } = parseMadr(serializeMadr(created.draft), created.fileName);
    expect(adr).toMatchObject({ status: 'reportée', decision: { nextReview: '2026-11-15' } });
  });

  it('asks last which ADR is superseded, empty meaning none', async () => {
    const answers = (supersedes: string): string[] => ['New cache', 'Context.', '', '', 'proposed', '', '', '', '', '', '', supersedes];
    const target = examples[0]!;
    const created = (await askNewAdr(scripted(answers(String(Number(target.id.slice(4))))).prompter, context, 20))!;
    expect(created.supersedes?.id).toBe(target.id);
    expect(created.draft.moreInfo).toBe(`Supersedes ${target.id} (${target.title}).`);
    await expect(askNewAdr(scripted(answers('999')).prompter, context, 20)).rejects.toThrow('No ADR numbered "999"');
  });
});

describe('askNewAdr options', () => {
  it('asks only the questions of the MADR minimal template', async () => {
    const { prompter, asked } = scripted(['Use Vitest', 'We need a test runner.', 'Vitest', 'Jest', '', 'accepted', [0], 'fast', 'one tool with Vite', '', 'slower watch mode', '']);
    const created = (await askNewAdr(prompter, { ...context, template: 'minimal' }, 30))!;
    expect(asked.filter((question) => question.kind === 'text').map((question) => question.message)).not.toContain(expect.stringContaining('Decision driver'));
    const content = serializeMadr(created.draft);
    expect(content).toContain('## Decision Outcome\n\nChosen option: "Vitest", because fast.\n\n### Consequences\n\n* Good, because one tool with Vite\n* Bad, because slower watch mode\n');
    expect(content).not.toContain('## Pros and Cons');
    expect(hasErrors(parseMadr(content, created.fileName).issues)).toBe(false);
  });

  it('shows ADRs on a close subject and stops when the author gives up', async () => {
    const { prompter, asked } = scripted(['ORM du service de commandes', 'Choisir un ORM typé pour les requêtes SQL.', false]);
    expect(await askNewAdr(prompter, context, 31)).toBeNull();
    const notice = asked.find((question) => question.kind === 'notice');
    expect(notice?.message).toContain('ADR-0007');
  });

  it('puts the ADR in a category folder, imposed or picked', async () => {
    const answers = (): (string | number[] | boolean)[] => ['Queue', 'Context.', '', '', 'proposed', '', '', '', '', '', '', ''];
    const imposed = (await askNewAdr(scripted(answers()).prompter, { ...context, category: 'backend' }, 32))!;
    expect(imposed.fileName).toBe('backend/0032-queue.md');
    const { prompter } = scripted(['Queue', 'Context.', 'ui', ...answers().slice(2)]);
    const picked = (await askNewAdr(prompter, { ...context, categories: ['backend', 'ui'] }, 33))!;
    expect(picked.fileName).toBe('ui/0033-queue.md');
  });
});

describe('helpers', () => {
  it('splits comma-separated answers', () => {
    expect(splitList(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(splitList('')).toEqual([]);
  });

  it('checks calendar dates', () => {
    expect(isCalendarDate('2026-10-07')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('07/10/2026')).toBe(false);
  });

  it('finds an ADR by number, padded or prefixed', () => {
    const target = examples[0]!;
    const number = String(Number(target.id.slice(4)));
    expect(findAdrByNumber(examples, number)?.id).toBe(target.id);
    expect(findAdrByNumber(examples, target.id)?.id).toBe(target.id);
    expect(findAdrByNumber(examples, target.id.slice(4))?.id).toBe(target.id);
    expect(findAdrByNumber(examples, 'abc')).toBeNull();
  });

  it('writes in the language of most ADRs, English by default', () => {
    expect(majorityLanguage([])).toBe('en');
    expect(majorityLanguage(examples)).toBe(examples.filter((adr) => adr.language === 'fr').length * 2 > examples.length ? 'fr' : 'en');
  });
});
