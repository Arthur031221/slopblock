import { extractText, findHints, textOf } from "./dom.ts";
import type { SiteAdapter } from "./types.ts";

const CANDIDATES = [
  "article",
  "[itemprop='articleBody']",
  ".post-content",
  ".entry-content",
  ".article-body",
  ".article-content",
  ".post-body",
  "main",
  "[role='main']",
];

const MIN_PARAGRAPHS = 3;
const MIN_WORDS = 120;
const MAX_CHARS = 20000;

function paragraphs(el: Element): Element[] {
  return Array.from(el.querySelectorAll("p")).filter((p) => textOf(p).length >= 40);
}

function paragraphChars(el: Element): number {
  return paragraphs(el).reduce((s, p) => s + textOf(p).length, 0);
}

/**
 * Find the element that holds the main text of the page: the best of the usual article
 * containers, or else the parent with the most paragraph text. A small version of what
 * reader modes do.
 */
export function findMainText(doc: Document): Element | null {
  let best: Element | null = null;
  let bestChars = 0;
  for (const sel of CANDIDATES) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const chars = paragraphChars(el);
      if (chars > bestChars * 1.2) {
        best = el;
        bestChars = chars;
      }
    }
    if (best) break;
  }
  if (!best) {
    const byParent = new Map<Element, number>();
    for (const p of Array.from(doc.querySelectorAll("p"))) {
      const len = textOf(p).length;
      if (len < 40 || !p.parentElement) continue;
      byParent.set(p.parentElement, (byParent.get(p.parentElement) ?? 0) + len);
    }
    for (const [el, chars] of byParent) {
      if (chars > bestChars) {
        best = el;
        bestChars = chars;
      }
    }
  }
  if (!best || best === doc.body || best === doc.documentElement) return null;
  if (best.closest("[contenteditable='true'], [contenteditable=''], form")) return null;
  if (paragraphs(best).length < MIN_PARAGRAPHS) return null;
  return best;
}

/** Any other page: score the main article text as one item. */
export const generic: SiteAdapter = {
  id: "generic",
  matches: () => true,
  find(root) {
    const doc = (root as Node).ownerDocument ?? (root as Document);
    const main = findMainText(doc);
    if (!main?.parentElement) return [];
    const text = extractText(main).slice(0, MAX_CHARS);
    if (text.split(/\s+/).length < MIN_WORDS) return [];
    return [
      {
        el: main,
        text,
        kind: "article",
        blur: [main],
        mount: main.parentElement,
        before: main,
        hints: findHints(main, "generic"),
      },
    ];
  },
};
