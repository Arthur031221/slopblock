import { extractText, findHints, first, hostIs, textOf } from "./dom.ts";
import type { FoundItem, SiteAdapter } from "./types.ts";

const CARD =
  "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model";
const CARD_TITLE = [
  "#video-title",
  "a#video-title-link",
  ".yt-lockup-metadata-view-model__title",
  ".yt-lockup-metadata-view-model-wiz__title",
  "h3 a",
];
const CARD_SNIPPET = [
  "#description-text",
  ".metadata-snippet-text",
  "yt-formatted-string.metadata-snippet-text",
];
const CARD_THUMB =
  "ytd-thumbnail, a#thumbnail, yt-thumbnail-view-model, .yt-lockup-view-model__content-image";
const CARD_CHANNEL = [
  "ytd-channel-name a",
  "#channel-name a",
  "ytd-channel-name",
  ".yt-content-metadata-view-model__metadata-text",
];
const BADGES = "ytd-badge-supported-renderer, .badge, badge-shape, .yt-badge-shape, [aria-label]";
// The "How this content was made" section under the description holds the disclosure label.
const WATCH_LABELS =
  "ytd-how-this-was-made-section-view-model *, [class*='how-this-was-made'] *, .ytVideoAttributeViewModelTitle, [aria-label]";

/** youtube.com feed cards, watch page description and comments. */
export const youtube: SiteAdapter = {
  id: "youtube",
  matches: (host) => hostIs(host, "youtube.com"),
  find(root) {
    const items: FoundItem[] = [];

    const cards = Array.from(root.querySelectorAll(CARD)).filter(
      (el) => !el.parentElement?.closest(CARD),
    );
    for (const card of cards) {
      const title = first(card, CARD_TITLE);
      if (!title?.parentElement) continue;
      const snippet = first(card, CARD_SNIPPET);
      const snippetText = snippet ? extractText(snippet) : "";
      const mount =
        title.closest(
          "#meta, #details, .yt-lockup-metadata-view-model__text-container, .yt-lockup-metadata-view-model-wiz__text-container",
        ) ?? title.parentElement;
      items.push({
        el: card,
        text: snippetText ? `${textOf(title)}\n\n${snippetText}` : textOf(title),
        kind: snippetText.split(/\s+/).length >= 12 ? "post" : "title",
        author: textOf(first(card, CARD_CHANNEL)) || undefined,
        blur: [title, snippet, card.querySelector(CARD_THUMB)].filter(
          (e): e is Element => e !== null,
        ),
        mount,
        before: title,
        hints: findHints(card, "youtube", BADGES),
      });
    }

    const watch = root.querySelector("ytd-watch-metadata");
    const description = watch
      ? first(watch, ["#description-inline-expander", "ytd-text-inline-expander", "#description"])
      : null;
    if (watch && description?.parentElement) {
      const heading = textOf(watch.querySelector("h1"));
      items.push({
        el: description,
        text: `${heading}\n\n${extractText(description)}`,
        kind: "post",
        author:
          textOf(
            first(watch, ["ytd-channel-name a", "#owner #channel-name a", "ytd-channel-name"]),
          ) || undefined,
        blur: [description],
        mount: description.parentElement,
        before: description,
        hints: findHints(watch, "youtube", WATCH_LABELS),
      });
    }

    for (const comment of Array.from(
      root.querySelectorAll("ytd-comment-view-model, ytd-comment-renderer"),
    )) {
      const text = comment.querySelector("#content-text");
      if (!text?.parentElement) continue;
      items.push({
        el: comment,
        text: extractText(text),
        kind: "comment",
        author: textOf(comment.querySelector("#author-text")) || undefined,
        blur: [text],
        mount: text.parentElement,
        before: text,
        hints: findHints(text, "youtube"),
      });
    }
    return items;
  },
};
