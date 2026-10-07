import type { Adr } from './schema.ts';
import { normalizeKey } from './vocabulary.ts';

/** Words too common in ADRs (English, French, Spanish) to tell two decisions apart. */
const STOP_WORDS = new Set(
  (
    'a an and are as at be by for from has have in into is it its of on or that the this to use using we with without our not ' +
    'au aux avec ce ces dans de des du en est et il la le les leur leurs mais ne nos notre nous ou par pas plus pour qui que sa se son sont sur un une utiliser ' +
    'al como con de del el en es la las lo los para por que se sin su sus un una usar y ' +
    'adr decision decisions option options choice choix'
  ).split(' '),
);

/** Lowercased words without accents, stop words or plural `s`. */
export function keywords(text: string): string[] {
  return normalizeKey(text)
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/u.test(word))
    .map((word) => (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word));
}

function vector(words: string[], idf: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  for (const word of words) result.set(word, (result.get(word) ?? 0) + (idf.get(word) ?? 1));
  return result;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [word, weight] of a) dot += weight * (b.get(word) ?? 0);
  const norm = (map: Map<string, number>): number => Math.sqrt([...map.values()].reduce((sum, value) => sum + value * value, 0));
  const denominator = norm(a) * norm(b);
  return denominator === 0 ? 0 : dot / denominator;
}

export interface SimilarAdr {
  adr: Adr;
  /** 0 to 1. */
  score: number;
  /** Significant words shared with the new ADR. */
  shared: string[];
}

/** Score from which an existing ADR is reported as possibly covering the same question. */
export const SIMILARITY_THRESHOLD = 0.3;

/**
 * Existing ADRs whose title or context are close to a new one (TF-IDF cosine on keywords, title counted twice),
 * so that a debate already settled is not reopened without knowing it. Most similar first.
 */
export function findSimilarAdrs(adrs: Adr[], draft: { title: string; context: string }, limit = 3, threshold = SIMILARITY_THRESHOLD): SimilarAdr[] {
  const text = (title: string, context: string, options: string[]): string[] => [...keywords(title), ...keywords(title), ...keywords(context), ...keywords(options.join(' '))];
  const documents = adrs.map((adr) => text(adr.title, adr.context, adr.propositions.map((proposition) => proposition.title)));
  const idf = new Map<string, number>();
  const frequency = new Map<string, number>();
  for (const words of documents) for (const word of new Set(words)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  for (const [word, count] of frequency) idf.set(word, Math.log(1 + (documents.length + 1) / count));
  const query = text(draft.title, draft.context, []);
  const queryVector = vector(query, idf);
  return adrs
    .map((adr, index) => {
      const words = documents[index]!;
      const shared = [...new Set(query)].filter((word) => words.includes(word));
      return { adr, score: Math.round(cosine(queryVector, vector(words, idf)) * 100) / 100, shared };
    })
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
