import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { compileList } from "../src/engine/lists.ts";
import type { WordList } from "../src/engine/types.ts";

export const ROOT = join(import.meta.dirname, "..");

export const DEFAULT_LIST: WordList = JSON.parse(
  readFileSync(join(ROOT, "lists/vocabulary.json"), "utf8"),
);

export const LIST = compileList(DEFAULT_LIST);

/** Load a fixture into a fresh jsdom with the given URL. */
export function loadFixture(name: string, url: string): Document {
  const html = readFileSync(join(ROOT, "tests/fixtures", name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

export const SLOP_COMMENT = `Great question! When it comes to password managers, it's important to note that security isn't just about encryption — it's about habits. Here's the thing: most breaches happen because of reused passwords.

**Key takeaways:**
- Use a unique password for every site
- Enable 2FA wherever possible
- Consider a reputable manager like Bitwarden or 1Password

Ultimately, the best password manager is the one you actually use. Hope this helps!`;

export const HUMAN_COMMENT = `I used KeePass for years and then moved to Bitwarden when I got a second laptop. The sync story with KeePass was always a mess for me, Dropbox conflicts every other week. Bitwarden's self-hosted option is nice but I ended up paying the $10 because I didn't want to babysit another container.`;

export const SLOP_LINKEDIN = `I'm thrilled to announce that I've joined Acme as Head of Growth! 🚀

This journey has been incredible.

I learned so much.

About resilience.

About people.

About growth.

Agree?

♻️ Repost if this resonated.

#leadership #growth #career #mindset`;
