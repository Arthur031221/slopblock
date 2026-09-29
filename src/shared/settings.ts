import { DEFAULT_THRESHOLD } from "../engine/score.ts";
import type { WordList } from "../engine/types.ts";

export type SiteId = "hackernews" | "x" | "linkedin" | "reddit" | "youtube" | "generic";

export const SITE_IDS: readonly SiteId[] = [
  "hackernews",
  "x",
  "linkedin",
  "reddit",
  "youtube",
  "generic",
];

export const SITE_LABELS: Record<SiteId, string> = {
  hackernews: "Hacker News",
  x: "X",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  youtube: "YouTube",
  generic: "Other sites (article mode)",
};

export interface Settings {
  enabled: boolean;
  /** Blur items whose score is at or above this value. */
  threshold: number;
  sites: Record<SiteId, boolean>;
  /** Author names or handles that are never blurred. Compared case-insensitively. */
  allowAuthors: string[];
  /** Hostnames where slopblock does nothing. Subdomains match too. */
  allowDomains: string[];
  /** Lower the blur while the pointer rests on an item. */
  hoverPreview: boolean;
  /** Your edited word list. `null` means the bundled default list. */
  customList: WordList | null;
}

export const MIN_THRESHOLD = 10;
export const MAX_THRESHOLD = 95;

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  threshold: DEFAULT_THRESHOLD,
  sites: {
    hackernews: true,
    x: true,
    linkedin: true,
    reddit: true,
    youtube: true,
    generic: true,
  },
  allowAuthors: [],
  allowDomains: [],
  hoverPreview: true,
  customList: null,
};

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}

/** Merge whatever is in storage with the defaults. Unknown or broken values fall back. */
export function mergeSettings(raw: unknown): Settings {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Settings>;
  const sites = { ...DEFAULT_SETTINGS.sites };
  if (typeof r.sites === "object" && r.sites !== null) {
    for (const id of SITE_IDS) {
      const v = (r.sites as Record<string, unknown>)[id];
      if (typeof v === "boolean") sites[id] = v;
    }
  }
  const threshold =
    typeof r.threshold === "number" && Number.isFinite(r.threshold)
      ? Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(r.threshold)))
      : DEFAULT_SETTINGS.threshold;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_SETTINGS.enabled,
    threshold,
    sites,
    allowAuthors: stringList(r.allowAuthors),
    allowDomains: stringList(r.allowDomains).map(normalizeDomain).filter(Boolean),
    hoverPreview: typeof r.hoverPreview === "boolean" ? r.hoverPreview : true,
    customList:
      typeof r.customList === "object" &&
      r.customList !== null &&
      Array.isArray(r.customList.entries)
        ? r.customList
        : null,
  };
}

export function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

/** True when `host` is one of the domains or a subdomain of one. */
export function isDomainAllowed(host: string, domains: readonly string[]): boolean {
  const h = normalizeDomain(host);
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

export function normalizeAuthor(a: string): string {
  return a
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^\/?u(?:ser)?\//, "");
}

export function isAuthorAllowed(author: string | undefined, authors: readonly string[]): boolean {
  if (!author) return false;
  const a = normalizeAuthor(author);
  return authors.some((x) => normalizeAuthor(x) === a);
}

export const SETTINGS_KEY = "settings";
