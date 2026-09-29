import type { SiteId } from "./settings.ts";

export interface Stats {
  /** Local calendar day the `today` counter belongs to, YYYY-MM-DD. */
  day: string;
  today: number;
  total: number;
  bySite: Partial<Record<SiteId, number>>;
}

export const STATS_KEY = "stats";

export function dayKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function emptyStats(day = dayKey()): Stats {
  return { day, today: 0, total: 0, bySite: {} };
}

export function readStats(raw: unknown, day = dayKey()): Stats {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<Stats>;
  const total = typeof r.total === "number" && r.total >= 0 ? r.total : 0;
  const sameDay = r.day === day;
  return {
    day,
    today: sameDay && typeof r.today === "number" && r.today >= 0 ? r.today : 0,
    total,
    bySite: typeof r.bySite === "object" && r.bySite !== null ? { ...r.bySite } : {},
  };
}

/** Add `n` newly hidden items. Rolls the daily counter over at local midnight. */
export function addHidden(stats: Stats, n: number, site: SiteId, day = dayKey()): Stats {
  const s = readStats(stats, day);
  const add = Math.max(0, Math.floor(n));
  return {
    day,
    today: s.today + add,
    total: s.total + add,
    bySite: { ...s.bySite, [site]: (s.bySite[site] ?? 0) + add },
  };
}
