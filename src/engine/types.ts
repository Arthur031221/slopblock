/** What kind of item a piece of text came from. Scoring adjusts a few signals per kind. */
export type ItemKind = "post" | "comment" | "title" | "article";

/** Kinds of list entries. See docs/lists.md for what each one does. */
export type EntryKind = "word" | "phrase" | "opener" | "signoff" | "hedge" | "template";

export interface ListEntry {
  term: string;
  weight: number;
  kind: EntryKind;
  source?: string;
}

export interface ListSource {
  id: string;
  title: string;
  url?: string;
  author?: string;
  date?: string;
  license?: string;
  note?: string;
}

export interface WordList {
  version: 1;
  name?: string;
  sources: ListSource[];
  entries: ListEntry[];
}

export type ReasonCategory = "vocabulary" | "structure" | "site";

export interface Reason {
  id: string;
  category: ReasonCategory;
  /** Short text for the chip, for example `Words: "delve", "tapestry"`. */
  label: string;
  /** Contribution to the raw score after length damping. */
  points: number;
  /** Longer explanation for the tooltip. */
  detail?: string;
}

/** Evidence an adapter found in the page around the text, such as a platform AI label. */
export interface SiteHint {
  id: SiteHintId;
  /** Site that produced the hint, for example "youtube". */
  site: string;
  /** The label text or link that was found. */
  detail?: string;
}

export type SiteHintId = "ai-label" | "content-credentials" | "chatbot-link";

export interface ScoreResult {
  /** 0 to 100. */
  score: number;
  /** Sorted by points, highest first. */
  reasons: Reason[];
  /** Word count of the scored text. */
  words: number;
  /** Sum of reason points before the 0 to 100 mapping. */
  raw: number;
}
