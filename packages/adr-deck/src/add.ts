import { DATE_PATTERN, madrFileName, statusValue, type Adr, type Language, type MadrDraft, type Status } from '@adr/format';

/** The questions `adr-deck add` asks; the CLI answers them in the terminal, tests with scripted answers. */
export interface Prompter {
  text(question: { message: string; required?: boolean; validate?: (value: string) => string | true }): Promise<string>;
  select<T extends string>(question: { message: string; choices: Choice<T>[]; default: T }): Promise<T>;
  checkbox(question: { message: string; choices: Choice<number>[]; required: boolean }): Promise<number[]>;
}

export interface Choice<T> {
  name: string;
  value: T;
  /** Reason shown when the choice cannot be picked. */
  disabled?: string;
}

export interface AddContext {
  /** Readable ADRs of the directory (for « supersedes »). */
  adrs: Adr[];
  language: Language;
  /** Today in Europe/Paris, `YYYY-MM-DD`. */
  today: string;
}

export interface NewAdr {
  id: string;
  fileName: string;
  draft: MadrDraft;
  /** The ADR the new one supersedes, or null. */
  supersedes: Adr | null;
}

/** Statuses a new ADR can take: `superseded by` only makes sense for an existing ADR. */
const NEW_STATUSES: Status[] = ['à décider', 'validée', 'refusée', 'reportée', 'obsolète'];

/** Splits a comma-separated answer into trimmed, non-empty items. */
export function splitList(answer: string): string[] {
  return answer
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** `3`, `0003` or `ADR-0003` → the ADR numbered 3, if any. */
export function findAdrByNumber(adrs: Adr[], answer: string): Adr | null {
  const match = /^(?:adr-?)?(\d+)$/iu.exec(answer.trim());
  if (!match) return null;
  return adrs.find((adr) => Number(adr.id.slice(4)) === Number(match[1])) ?? null;
}

/** Asks for items one by one until an empty answer. */
async function askList(prompter: Prompter, message: (index: number) => string): Promise<string[]> {
  const items: string[] = [];
  for (;;) {
    const item = (await prompter.text({ message: message(items.length + 1) })).trim();
    if (item === '') return items;
    items.push(item);
  }
}

function optional(text: string): string | null {
  const value = text.trim();
  return value === '' ? null : value;
}

/** Asks every field of a MADR file, then whether the new ADR supersedes an existing one. */
export async function askNewAdr(prompter: Prompter, context: AddContext, number: number): Promise<NewAdr> {
  const id = `ADR-${String(number).padStart(4, '0')}`;
  const title = (await prompter.text({ message: `${id} title`, required: true })).trim();
  const contextText = (await prompter.text({ message: 'Context and problem statement', required: true })).trim();
  const drivers = await askList(prompter, (index) => `Decision driver ${index}: a criterion the options are judged on (empty to finish)`);

  const propositions: MadrDraft['propositions'] = [];
  for (;;) {
    const optionTitle = (await prompter.text({ message: `Option ${propositions.length + 1} (empty to finish)` })).trim();
    if (optionTitle === '') break;
    if (propositions.some((proposition) => proposition.title === optionTitle)) continue;
    const body = (await prompter.text({ message: `  "${optionTitle}": description (optional)` })).trim();
    const pros = await askList(prompter, () => `  "${optionTitle}": Good, because… (empty to finish)`);
    const cons = await askList(prompter, () => `  "${optionTitle}": Bad, because… (empty to finish)`);
    propositions.push({ title: optionTitle, body, pros, cons });
  }

  const status = await prompter.select<Status>({
    message: 'Status',
    default: 'à décider',
    choices: NEW_STATUSES.map((value) => ({
      name: statusValue(value, null),
      value,
      ...(value === 'validée' && propositions.length === 0 ? { disabled: '(needs at least one option)' } : {}),
    })),
  });

  let chosen: number[] = [];
  if (propositions.length > 0 && (status === 'validée' || status === 'à décider')) {
    chosen = await prompter.checkbox({
      message: status === 'validée' ? 'Chosen options' : 'Recommended options (optional)',
      choices: propositions.map((proposition, index) => ({ name: proposition.title, value: index })),
      required: status === 'validée',
    });
  }
  const nextReview =
    status === 'reportée'
      ? optional(await prompter.text({ message: 'Next review (YYYY-MM-DD, optional)', validate: (value) => value.trim() === '' || isCalendarDate(value.trim()) || 'Expected a date written YYYY-MM-DD.' }))
      : null;
  const comment = optional(await prompter.text({ message: 'Justification: why this status (optional)' }));

  const deciders = splitList(await prompter.text({ message: 'Decision makers: who decides (comma-separated, optional)' }));
  const consulted = splitList(await prompter.text({ message: 'Consulted: whose opinion is asked before deciding (comma-separated, optional)' }));
  const informed = splitList(await prompter.text({ message: 'Informed: who is told once it is decided (comma-separated, optional)' }));
  const tags = splitList(await prompter.text({ message: 'Tags (comma-separated, optional)' }));
  const moreInfo = (await prompter.text({ message: 'More information: links, follow-up, when to revisit (optional)' })).trim();

  const supersedesAnswer = await prompter.text({
    message: 'Supersedes ADR number (empty = none)',
    validate: (value) => value.trim() === '' || findAdrByNumber(context.adrs, value) !== null || `No ADR numbered "${value.trim()}" in this directory.`,
  });
  const supersedes = supersedesAnswer.trim() === '' ? null : findAdrByNumber(context.adrs, supersedesAnswer);
  const supersedesNote = supersedes === null ? '' : `${context.language === 'fr' ? 'Remplace' : 'Supersedes'} ${supersedes.id} (${supersedes.title}).`;

  return {
    id,
    fileName: madrFileName(String(number), title),
    supersedes,
    draft: {
      title,
      status,
      replacedBy: null,
      date: context.today,
      nextReview,
      deciders,
      consulted,
      informed,
      tags,
      otherMetadata: [],
      context: contextText,
      drivers: drivers.map((driver) => `* ${driver}`).join('\n'),
      propositions,
      chosen,
      comment,
      outcomeDetails: '',
      moreInfo: [moreInfo, supersedesNote].filter(Boolean).join('\n\n'),
      otherSections: [],
      language: context.language,
    },
  };
}

/** Language of most ADRs of the directory; English (the MADR template) when there is none. */
export function majorityLanguage(adrs: Adr[]): Language {
  const french = adrs.filter((adr) => adr.language === 'fr').length;
  return french * 2 > adrs.length ? 'fr' : 'en';
}
