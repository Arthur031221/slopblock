import type { CompiledList } from "../engine/lists.ts";
import { scoreText } from "../engine/score.ts";
import type { ScoreResult } from "../engine/types.ts";
import {
  isAuthorAllowed,
  isDomainAllowed,
  type Settings,
  type SiteId,
} from "../shared/settings.ts";
import type { SiteAdapter } from "../sites/types.ts";
import { Blur, STRIP_TAG } from "./blur.ts";

interface ItemRecord {
  sig: string;
  result: ScoreResult;
  blur?: Blur;
}

export interface PageState {
  site: SiteId;
  active: boolean;
  scanned: number;
  hidden: number;
}

export interface ScannerOptions {
  adapter: SiteAdapter;
  doc: Document;
  settings: Settings;
  list: CompiledList;
  /** Called after a scan that hid items this page had not hidden before. */
  onHidden?: (added: number, pageTotal: number) => void;
  /** Debounce for DOM mutations, in milliseconds. */
  debounceMs?: number;
}

/** 32-bit FNV-1a, enough to tell texts apart for per-page counting. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function signature(text: string): string {
  return `${text.length}:${hash(text)}`;
}

/**
 * Finds items with the site adapter, scores them and blurs the ones over the threshold.
 * Keeps state per element so rescans after infinite scroll only touch new or changed items.
 */
export class Scanner {
  private records = new WeakMap<Element, ItemRecord>();
  private blurs = new Set<Blur>();
  private counted = new Set<number>();
  private scannedCount = 0;
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private opts: ScannerOptions;

  constructor(opts: ScannerOptions) {
    this.opts = opts;
  }

  get hiddenOnPage(): number {
    return this.counted.size;
  }

  isActive(): boolean {
    const { settings, adapter, doc } = this.opts;
    const host = doc.location?.hostname ?? "";
    return (
      settings.enabled &&
      settings.sites[adapter.id] !== false &&
      !isDomainAllowed(host, settings.allowDomains)
    );
  }

  /** Score new and changed items. Returns how many were newly hidden on this page. */
  scan(): number {
    this.prune();
    if (!this.isActive()) return 0;
    const { adapter, doc, settings, list } = this.opts;
    let added = 0;
    for (const item of adapter.find(doc)) {
      const sig = signature(item.text);
      const prev = this.records.get(item.el);
      if (prev && prev.sig === sig && (!prev.blur || prev.blur.strip.isConnected)) continue;
      if (prev?.blur) {
        prev.blur.remove();
        this.blurs.delete(prev.blur);
      }
      const result = scoreText(item.text, list, { kind: item.kind, hints: item.hints });
      const record: ItemRecord = { sig, result };
      if (prev === undefined) this.scannedCount++;
      if (
        result.score >= settings.threshold &&
        !isAuthorAllowed(item.author, settings.allowAuthors)
      ) {
        const blur = new Blur(item, result);
        if (prev?.blur?.isRevealed) blur.reveal();
        record.blur = blur;
        this.blurs.add(blur);
        const h = hash(item.text);
        if (!this.counted.has(h)) {
          this.counted.add(h);
          added++;
        }
      }
      this.records.set(item.el, record);
    }
    if (added > 0) this.opts.onHidden?.(added, this.counted.size);
    return added;
  }

  /** Remove every blur and forget every score. The next scan starts fresh. */
  reset(): void {
    for (const b of this.blurs) b.remove();
    this.blurs.clear();
    this.records = new WeakMap();
    this.scannedCount = 0;
  }

  /** Apply new settings or a new list: clear and rescan. */
  update(settings: Settings, list?: CompiledList): void {
    this.opts.settings = settings;
    if (list) this.opts.list = list;
    this.reset();
    this.scan();
  }

  observe(): void {
    const { doc } = this.opts;
    if (this.observer || !doc.body) return;
    const View = doc.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new View((mutations) => {
      const relevant = mutations.some((m) =>
        Array.from(m.addedNodes).some(
          (n) => !(n.nodeType === 1 && (n as Element).tagName.toLowerCase() === STRIP_TAG),
        ),
      );
      if (relevant) this.schedule();
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
    }, this.opts.debounceMs ?? 300);
  }

  private prune(): void {
    for (const b of this.blurs) {
      if (!b.item.el.isConnected) this.blurs.delete(b);
    }
  }

  state(): PageState {
    let hidden = 0;
    for (const b of this.blurs) if (!b.isRevealed) hidden++;
    return {
      site: this.opts.adapter.id,
      active: this.isActive(),
      scanned: this.scannedCount,
      hidden,
    };
  }
}
