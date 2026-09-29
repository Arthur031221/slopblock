/**
 * Text helpers shared by the signal modules. Everything here is pure and works on plain
 * strings, so the engine runs the same in the content script, the options page and Node.
 */

const WORD_RE = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu;

/** Straighten quotes, unify line endings and squeeze horizontal whitespace. */
export function normalize(text: string): string {
  return text
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t   ]+/g, " ");
}

export function words(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|jr|sr|st|approx|incl|no)\.(?=\s)/gi;

/** Split into sentences. Newlines always end a sentence, which suits feed posts. */
export function sentences(text: string): string[] {
  const protectedText = text.replace(ABBREVIATIONS, (m) => `${m.slice(0, -1)}\uE000`);
  return protectedText
    .split(/(?<=[.!?])["')\]]*\s+|\n+/)
    .map((s) => s.replace(/\uE000/g, ".").trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

export function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Everything the signal modules need, computed once per text. */
export interface Doc {
  raw: string;
  norm: string;
  lower: string;
  words: string[];
  wordCount: number;
  sentences: string[];
  lines: string[];
  paragraphs: string[];
}

export function analyze(text: string): Doc {
  const norm = normalize(text).trim();
  const w = words(norm);
  return {
    raw: text,
    norm,
    lower: norm.toLowerCase(),
    words: w,
    wordCount: w.length,
    sentences: sentences(norm),
    lines: lines(norm),
    paragraphs: paragraphs(norm),
  };
}

export function countMatches(text: string, re: RegExp): number {
  let n = 0;
  re.lastIndex = 0;
  while (re.exec(text) !== null) {
    n++;
  }
  re.lastIndex = 0;
  return n;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Quote a list of terms for a chip label: `"a", "b" +3`. */
export function quoteTerms(terms: string[], max = 2): string {
  const shown = terms.slice(0, max).map((t) => `"${t}"`);
  const rest = terms.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest}` : shown.join(", ");
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
