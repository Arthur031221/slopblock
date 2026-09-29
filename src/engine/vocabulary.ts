import type { CompiledList, PatternEntry } from "./lists.ts";
import { countMatches, type Doc, quoteTerms, round1 } from "./text.ts";
import type { ListEntry, Reason } from "./types.ts";

interface Hit {
  entry: ListEntry;
  count: number;
  /** The form seen in the text, used for labels. Differs from the term for `delv*` entries. */
  seen?: string;
}

/**
 * Long texts use more of every word, human or not. Scale vocabulary points down past about
 * 200 words so a long human essay does not add up to a high score through sheer length.
 */
export function lengthNorm(wordCount: number): number {
  return Math.min(1, Math.sqrt(200 / Math.max(wordCount, 1)));
}

function hitPoints(hit: Hit): number {
  return hit.entry.weight * (1 + 0.5 * Math.log(hit.count));
}

function shown(hit: Hit): string {
  return hit.seen ?? hit.entry.term;
}

function sortedTerms(hits: Hit[]): string[] {
  return [...hits].sort((a, b) => hitPoints(b) - hitPoints(a)).map(shown);
}

function detailOf(hits: Hit[]): string {
  return [...hits]
    .sort((a, b) => hitPoints(b) - hitPoints(a))
    .map((h) => (h.count > 1 ? `${shown(h)} x${h.count}` : shown(h)))
    .join(", ");
}

function patternHits(text: string, patterns: PatternEntry[]): Hit[] {
  const hits: Hit[] = [];
  for (const p of patterns) {
    const count = countMatches(text, p.re);
    if (count > 0) hits.push({ entry: p.entry, count });
  }
  return hits;
}

export function wordHits(doc: Doc, list: CompiledList): Hit[] {
  const counts = new Map<ListEntry, number>();
  const seen = new Map<ListEntry, string>();
  for (const w of doc.words) {
    let entry = list.exact.get(w);
    if (!entry) {
      for (const p of list.prefix) {
        if (w.startsWith(p.stem)) {
          entry = p.entry;
          break;
        }
      }
    }
    if (entry) {
      counts.set(entry, (counts.get(entry) ?? 0) + 1);
      if (!seen.has(entry)) seen.set(entry, w);
    }
  }
  return [...counts].map(([entry, count]) => ({ entry, count, seen: seen.get(entry) }));
}

/** The last paragraph, or the last 240 characters when the text is one block. */
function tail(doc: Doc): string {
  const last = doc.paragraphs[doc.paragraphs.length - 1] ?? "";
  if (doc.paragraphs.length > 1 && last.length <= 320) return last.toLowerCase();
  return doc.lower.slice(-240);
}

export function vocabularySignals(doc: Doc, list: CompiledList): Reason[] {
  const reasons: Reason[] = [];
  const norm = lengthNorm(doc.wordCount);

  const words = wordHits(doc, list);
  if (words.length > 0) {
    const points = words.reduce((s, h) => s + hitPoints(h), 0) * norm;
    reasons.push({
      id: "words",
      category: "vocabulary",
      label: `Words: ${quoteTerms(sortedTerms(words))}`,
      points: round1(points),
      detail: `Listed words found: ${detailOf(words)}.`,
    });
  }

  const phrases = patternHits(doc.lower, list.phrases);
  if (phrases.length > 0) {
    const points = phrases.reduce((s, h) => s + hitPoints(h), 0) * norm;
    reasons.push({
      id: "phrases",
      category: "vocabulary",
      label: `Phrases: ${quoteTerms(sortedTerms(phrases), 1)}`,
      points: round1(points),
      detail: `Stock phrases found: ${detailOf(phrases)}.`,
    });
  }

  const head = doc.lower.slice(0, 100);
  let opener: ListEntry | undefined;
  for (const p of list.openers) {
    p.re.lastIndex = 0;
    const m = p.re.exec(head);
    p.re.lastIndex = 0;
    if (m && m.index <= 4 && (!opener || p.entry.weight > opener.weight)) opener = p.entry;
  }
  if (opener) {
    reasons.push({
      id: "opener",
      category: "vocabulary",
      label: `Opens with "${opener.term}"`,
      points: opener.weight,
      detail: `The text starts with "${opener.term}", a common chatbot or template opener.`,
    });
  }

  const signoffs = patternHits(tail(doc), list.signoffs);
  if (signoffs.length > 0) {
    const points = Math.min(
      30,
      signoffs.reduce((s, h) => s + h.entry.weight, 0),
    );
    const terms = sortedTerms(signoffs);
    reasons.push({
      id: "signoff",
      category: "vocabulary",
      label: `Ends with ${quoteTerms(terms, 1)}`,
      points,
      detail: `Sign-off found in the last paragraph: ${terms.join(", ")}.`,
    });
  }

  const hedges = patternHits(doc.lower, list.hedges);
  const hedgeCount = hedges.reduce((s, h) => s + h.count, 0);
  if (hedgeCount >= 2) {
    const weight = hedges.reduce((s, h) => s + h.entry.weight * h.count, 0);
    reasons.push({
      id: "hedging",
      category: "vocabulary",
      label: `Hedging x${hedgeCount}`,
      points: round1(Math.min(14, weight * norm)),
      detail: `Hedges and filler: ${detailOf(hedges)}.`,
    });
  }

  const templates = patternHits(doc.lower, list.templates);
  if (templates.length >= 2) {
    const terms = sortedTerms(templates);
    reasons.push({
      id: "template",
      category: "site",
      label: "Template post",
      points: Math.min(
        28,
        templates.reduce((s, h) => s + h.entry.weight, 0),
      ),
      detail: `Engagement template markers: ${terms.join(", ")}.`,
    });
  }

  return reasons;
}
