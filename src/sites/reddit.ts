import { extractText, findHints, hostIs, textOf } from "./dom.ts";
import type { FoundItem, SiteAdapter } from "./types.ts";

function newReddit(root: ParentNode): FoundItem[] {
  const items: FoundItem[] = [];
  for (const post of Array.from(root.querySelectorAll("shreddit-post"))) {
    const titleEl = post.querySelector('[slot="title"]:not(slopblock-strip)');
    const title = post.getAttribute("post-title") ?? textOf(titleEl);
    const body = post.querySelector('[slot="text-body"]:not(slopblock-strip)');
    const anchor = body ?? titleEl;
    if (!anchor?.parentElement) continue;
    const bodyText = body ? extractText(body) : "";
    items.push({
      el: post,
      text: bodyText ? `${title}\n\n${bodyText}` : title,
      kind: bodyText ? "post" : "title",
      author: post.getAttribute("author") ?? undefined,
      blur: [titleEl, body].filter((e): e is Element => e !== null),
      mount: anchor.parentElement,
      before: anchor,
      hints: body ? findHints(body, "reddit") : [],
    });
  }
  for (const comment of Array.from(root.querySelectorAll("shreddit-comment"))) {
    const body = comment.querySelector(':scope > [slot="comment"]:not(slopblock-strip)');
    if (!body?.parentElement) continue;
    items.push({
      el: comment,
      text: extractText(body),
      kind: "comment",
      author: comment.getAttribute("author") ?? undefined,
      blur: [body],
      mount: body.parentElement,
      before: body,
      hints: findHints(body, "reddit"),
    });
  }
  return items;
}

function oldReddit(root: ParentNode): FoundItem[] {
  const items: FoundItem[] = [];
  for (const thing of Array.from(root.querySelectorAll("div.thing.link, div.thing.comment"))) {
    const isComment = thing.classList.contains("comment");
    const entry = thing.querySelector(":scope > .entry");
    if (!entry) continue;
    const md = entry.querySelector(".usertext-body .md");
    const author = thing.getAttribute("data-author") ?? undefined;
    if (isComment) {
      if (!md?.parentElement) continue;
      items.push({
        el: thing,
        text: extractText(md),
        kind: "comment",
        author,
        blur: [md],
        mount: md.parentElement,
        before: md,
        hints: findHints(md, "reddit"),
      });
      continue;
    }
    const title = entry.querySelector("a.title");
    if (!title?.parentElement) continue;
    const body = md ? extractText(md) : "";
    const blur: Element[] = [title];
    if (md) blur.push(md);
    items.push({
      el: thing,
      text: body ? `${textOf(title)}\n\n${body}` : textOf(title),
      kind: body ? "post" : "title",
      author,
      blur,
      mount: md?.parentElement ?? title.parentElement,
      before: md ?? title,
      hints: md ? findHints(md, "reddit") : [],
    });
  }
  return items;
}

/** reddit.com (the shreddit web components) and old.reddit.com. */
export const reddit: SiteAdapter = {
  id: "reddit",
  matches: (host) => hostIs(host, "reddit.com"),
  find(root) {
    return [...newReddit(root), ...oldReddit(root)];
  },
};
