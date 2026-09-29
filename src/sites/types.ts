import type { ItemKind, SiteHint } from "../engine/types.ts";
import type { SiteId } from "../shared/settings.ts";

/** One post, comment or article found on a page. */
export interface FoundItem {
  /** Stable root element of the item. Used for bookkeeping. */
  el: Element;
  text: string;
  kind: ItemKind;
  author?: string;
  /** Elements that get blurred. The first one is the main text and folds to a few lines. */
  blur: Element[];
  /** Parent element that receives the reason strip. */
  mount: Element;
  /** Insert the strip before this child of `mount`. Appended when missing. */
  before?: Element | null;
  hints?: SiteHint[];
}

export interface SiteAdapter {
  id: SiteId;
  matches(host: string): boolean;
  find(root: ParentNode): FoundItem[];
}
