import { extractText, findHints, hostIs } from "./dom.ts";
import type { FoundItem, SiteAdapter } from "./types.ts";

const MEDIA =
  '[data-testid="tweetPhoto"], [data-testid="card.wrapper"], [data-testid="videoPlayer"]';

/** Handle from the first profile link in the tweet header, without the @. */
function handleOf(tweet: Element): string | undefined {
  const link = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
  const href = link?.getAttribute("href") ?? "";
  const m = /^\/([A-Za-z0-9_]{1,15})(?:$|[/?#])/.exec(href);
  return m ? m[1] : undefined;
}

/** x.com and twitter.com timelines, threads and replies. */
export const x: SiteAdapter = {
  id: "x",
  matches: (host) => hostIs(host, "x.com", "twitter.com"),
  find(root) {
    const items: FoundItem[] = [];
    for (const tweet of Array.from(root.querySelectorAll('article[data-testid="tweet"]'))) {
      // A tweet nested in another tweet is a quote card. It is scored with its outer tweet.
      if (tweet.parentElement?.closest('article[data-testid="tweet"]')) continue;
      // The tweet's own text, not the text inside a quoted tweet card (a role="link" block).
      const text = Array.from(tweet.querySelectorAll('[data-testid="tweetText"]')).find((t) => {
        const card = t.closest('[role="link"]');
        return !card || !tweet.contains(card) || card === tweet;
      });
      if (!text?.parentElement) continue;
      const media = Array.from(tweet.querySelectorAll(MEDIA)).filter(
        (m) => m.closest('article[data-testid="tweet"]') === tweet,
      );
      items.push({
        el: tweet,
        text: extractText(text),
        kind: "post",
        author: handleOf(tweet),
        blur: [text, ...media],
        mount: text.parentElement,
        before: text,
        hints: findHints(tweet, "x", '[data-testid="aiGeneratedLabel"], [aria-label]'),
      });
    }
    return items;
  },
};
