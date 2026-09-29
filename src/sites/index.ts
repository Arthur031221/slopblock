import { generic } from "./generic.ts";
import { hackernews } from "./hackernews.ts";
import { linkedin } from "./linkedin.ts";
import { reddit } from "./reddit.ts";
import type { SiteAdapter } from "./types.ts";
import { x } from "./x.ts";
import { youtube } from "./youtube.ts";

export const SITE_ADAPTERS: readonly SiteAdapter[] = [hackernews, x, linkedin, reddit, youtube];

/** The adapter for a hostname. Pages without a dedicated adapter get article mode. */
export function adapterFor(host: string): SiteAdapter {
  return SITE_ADAPTERS.find((a) => a.matches(host)) ?? generic;
}

export type { FoundItem, SiteAdapter } from "./types.ts";
export { generic, hackernews, linkedin, reddit, x, youtube };
