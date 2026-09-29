import { extractText, findHints, first, hostIs, textOf } from "./dom.ts";
import type { FoundItem, SiteAdapter } from "./types.ts";

const POST = "div.feed-shared-update-v2, div[data-urn^='urn:li:activity:']";
const POST_TEXT = [
  ".update-components-text",
  ".feed-shared-update-v2__description",
  ".feed-shared-inline-show-more-text",
  ".feed-shared-text",
];
const POST_MEDIA =
  ".update-components-image, .update-components-article, .update-components-linkedin-video, .update-components-document";
const ACTOR = [
  ".update-components-actor__title span[aria-hidden='true']",
  ".update-components-actor__name span[aria-hidden='true']",
  ".update-components-actor__title",
  ".update-components-actor__name",
];
const LABELS =
  ".update-components-actor__sub-description, .ai-generated-label, [aria-label], [data-test-ai-label]";
const COMMENT = "article.comments-comment-entity, article.comments-comment-item";

/** linkedin.com feed posts and comments. */
export const linkedin: SiteAdapter = {
  id: "linkedin",
  matches: (host) => hostIs(host, "linkedin.com"),
  find(root) {
    const items: FoundItem[] = [];
    const posts = Array.from(root.querySelectorAll(POST)).filter(
      // The same post can match both selectors when one wraps the other. Keep the outer one.
      (el) => !el.parentElement?.closest(POST),
    );
    for (const post of posts) {
      const text = first(post, POST_TEXT);
      if (!text?.parentElement || text.closest(COMMENT)) continue;
      const media = Array.from(post.querySelectorAll(POST_MEDIA));
      const hints = findHints(post, "linkedin", LABELS);
      if (post.querySelector("[aria-label*='Content Credentials' i], .content-credentials")) {
        hints.push({ id: "content-credentials", site: "linkedin" });
      }
      items.push({
        el: post,
        text: extractText(text),
        kind: "post",
        author: textOf(first(post, ACTOR)) || undefined,
        blur: [text, ...media],
        mount: text.parentElement,
        before: text,
        hints,
      });
    }
    for (const comment of Array.from(root.querySelectorAll(COMMENT))) {
      const text = first(comment, [
        ".comments-comment-item__main-content",
        ".comments-comment-entity__content",
        ".update-components-text",
      ]);
      if (!text?.parentElement) continue;
      items.push({
        el: comment,
        text: extractText(text),
        kind: "comment",
        author:
          textOf(
            first(comment, [
              ".comments-comment-meta__description-title",
              ".comments-post-meta__name-text",
            ]),
          ) || undefined,
        blur: [text],
        mount: text.parentElement,
        before: text,
        hints: findHints(text, "linkedin"),
      });
    }
    return items;
  },
};
