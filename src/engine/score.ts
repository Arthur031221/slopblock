import { type CompiledList, compileList } from "./lists.ts";
import { siteSignals } from "./site.ts";
import { structureSignals } from "./structure.ts";
import { analyze, round1 } from "./text.ts";
import type { ItemKind, Reason, ScoreResult, SiteHint, WordList } from "./types.ts";
import { vocabularySignals } from "./vocabulary.ts";

/**
 * Default blur threshold. Chosen on the dev half of the benchmark to keep precision high,
 * see bench/results.md. The popup slider moves it.
 */
export const DEFAULT_THRESHOLD = 50;

/**
 * Raw points that map to a score of about 63. Set so that the dev-half operating point lands
 * on a score of 50. The curve flattens above that.
 */
export const SCALE = 34;

export interface ScoreOptions {
  kind?: ItemKind;
  hints?: readonly SiteHint[];
}

/**
 * Very short texts carry little evidence. Scale their points down so a single listed word in
 * a one-line reply does not blur it. Titles get a fixed factor.
 */
export function lengthDamping(words: number, kind: ItemKind): number {
  if (kind === "title") return 0.6;
  return Math.min(1, (words + 10) / 60);
}

export function toScore(raw: number): number {
  return Math.round(100 * (1 - Math.exp(-Math.max(0, raw) / SCALE)));
}

export function scoreText(text: string, list: CompiledList, opts: ScoreOptions = {}): ScoreResult {
  const kind = opts.kind ?? "post";
  const doc = analyze(text);
  const site = siteSignals(opts.hints);
  if (doc.wordCount < 4 && site.length === 0) {
    return { score: 0, reasons: [], words: doc.wordCount, raw: 0 };
  }
  const damp = lengthDamping(doc.wordCount, kind);
  const textReasons = [...vocabularySignals(doc, list), ...structureSignals(doc, kind)].map(
    (r): Reason => (r.id === "leftover" ? r : { ...r, points: round1(r.points * damp) }),
  );
  const reasons = [...site, ...textReasons]
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);
  const raw = round1(reasons.reduce((s, r) => s + r.points, 0));
  return { score: toScore(raw), reasons, words: doc.wordCount, raw };
}

/** Convenience wrapper for one-off calls. Compile the list yourself when scoring many texts. */
export function scoreWithList(text: string, list: WordList, opts: ScoreOptions = {}): ScoreResult {
  return scoreText(text, compileList(list), opts);
}
