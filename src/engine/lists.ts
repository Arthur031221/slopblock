import { escapeRegExp, normalize } from "./text.ts";
import type { EntryKind, ListEntry, WordList } from "./types.ts";

export const ENTRY_KINDS: readonly EntryKind[] = [
  "word",
  "phrase",
  "opener",
  "signoff",
  "hedge",
  "template",
];

export const MAX_WEIGHT = 100;
export const MAX_ENTRIES = 5000;

export interface PatternEntry {
  entry: ListEntry;
  re: RegExp;
}

/** A word list turned into fast lookups. Build it once per list, reuse it for every text. */
export interface CompiledList {
  /** Single words matched against tokens. */
  exact: Map<string, ListEntry>;
  /** Words ending in `*`, matched as token prefixes. */
  prefix: { stem: string; entry: ListEntry }[];
  /** Multi-word phrases, matched as regular expressions over the lowercased text. */
  phrases: PatternEntry[];
  openers: PatternEntry[];
  signoffs: PatternEntry[];
  hedges: PatternEntry[];
  templates: PatternEntry[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const ONE_TOKEN = /^[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*\*?$/u;

export function normalizeTerm(term: string): string {
  return normalize(term).toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Build a regular expression for a phrase. A `*` inside or at the end of a word matches any
 * word characters, so `plays a * role` matches "plays a key role".
 */
export function phraseRegExp(term: string): RegExp {
  const t = normalizeTerm(term);
  const body = t
    .split(" ")
    .map((part) =>
      part === "*"
        ? "[\\p{L}\\p{N}'-]+"
        : part.split("*").map(escapeRegExp).join("[\\p{L}\\p{N}'-]*"),
    )
    .join("\\s+");
  const first = t.charAt(0);
  const last = t.charAt(t.length - 1);
  const start = WORD_CHAR.test(first) || first === "*" ? "(?<![\\p{L}\\p{N}'])" : "";
  const end = WORD_CHAR.test(last) || last === "*" ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(start + body + end, "gu");
}

export function compileList(list: WordList): CompiledList {
  const compiled: CompiledList = {
    exact: new Map(),
    prefix: [],
    phrases: [],
    openers: [],
    signoffs: [],
    hedges: [],
    templates: [],
  };
  for (const entry of list.entries) {
    const term = normalizeTerm(entry.term);
    if (!term || !(entry.weight > 0)) continue;
    switch (entry.kind) {
      case "word":
      case "phrase":
        if (ONE_TOKEN.test(term)) {
          if (term.endsWith("*")) {
            compiled.prefix.push({ stem: term.slice(0, -1), entry });
          } else {
            compiled.exact.set(term, entry);
          }
        } else {
          compiled.phrases.push({ entry, re: phraseRegExp(term) });
        }
        break;
      case "opener":
        compiled.openers.push({ entry, re: phraseRegExp(term) });
        break;
      case "signoff":
        compiled.signoffs.push({ entry, re: phraseRegExp(term) });
        break;
      case "hedge":
        compiled.hedges.push({ entry, re: phraseRegExp(term) });
        break;
      case "template":
        compiled.templates.push({ entry, re: phraseRegExp(term) });
        break;
    }
  }
  return compiled;
}

export type ValidationResult = { ok: true; list: WordList } | { ok: false; errors: string[] };

/**
 * Check a list that came from an import or from storage. Accepts either a full list object or
 * a bare array of entries. Returns a cleaned copy with duplicates removed.
 */
export function validateList(input: unknown): ValidationResult {
  const errors: string[] = [];
  let raw: unknown = input;
  if (Array.isArray(raw)) raw = { version: 1, sources: [], entries: raw };
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["Expected a JSON object with an `entries` array."] };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) {
    return { ok: false, errors: ["Missing `entries` array."] };
  }
  if (obj.entries.length > MAX_ENTRIES) {
    return { ok: false, errors: [`Too many entries (${obj.entries.length}, max ${MAX_ENTRIES}).`] };
  }
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  obj.entries.forEach((e: unknown, i: number) => {
    if (typeof e !== "object" || e === null) {
      errors.push(`Entry ${i + 1}: not an object.`);
      return;
    }
    const r = e as Record<string, unknown>;
    const term = typeof r.term === "string" ? normalizeTerm(r.term) : "";
    const weight = typeof r.weight === "number" ? r.weight : Number(r.weight);
    const kind = (r.kind ?? "word") as EntryKind;
    if (!term) {
      errors.push(`Entry ${i + 1}: empty term.`);
      return;
    }
    if (term.length > 120) {
      errors.push(`Entry ${i + 1} ("${term.slice(0, 20)}..."): term longer than 120 characters.`);
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > MAX_WEIGHT) {
      errors.push(
        `Entry ${i + 1} ("${term}"): weight must be a number above 0 and at most ${MAX_WEIGHT}.`,
      );
      return;
    }
    if (!ENTRY_KINDS.includes(kind)) {
      errors.push(`Entry ${i + 1} ("${term}"): unknown kind "${String(kind)}".`);
      return;
    }
    const key = `${kind}:${term}`;
    if (seen.has(key)) return;
    seen.add(key);
    const entry: ListEntry = { term, weight, kind };
    if (typeof r.source === "string" && r.source) entry.source = r.source;
    entries.push(entry);
  });
  if (errors.length > 0) return { ok: false, errors };
  const sources = Array.isArray(obj.sources)
    ? obj.sources.filter(
        (s): s is WordList["sources"][number] =>
          typeof s === "object" && s !== null && typeof (s as { id?: unknown }).id === "string",
      )
    : [];
  const list: WordList = { version: 1, sources, entries };
  if (typeof obj.name === "string") list.name = obj.name;
  return { ok: true, list };
}
