import { extractText, findHints, hostIs, textOf } from "./dom.ts";
import type { FoundItem, SiteAdapter } from "./types.ts";

/** news.ycombinator.com: front page titles, comment threads and Ask or Show HN text. */
export const hackernews: SiteAdapter = {
  id: "hackernews",
  matches: (host) => hostIs(host, "news.ycombinator.com"),
  find(root) {
    const items: FoundItem[] = [];

    for (const row of Array.from(root.querySelectorAll("tr.athing.comtr"))) {
      const body = row.querySelector(".commtext");
      if (!body?.parentElement) continue;
      items.push({
        el: row,
        text: extractText(body),
        kind: "comment",
        author: textOf(row.querySelector("a.hnuser")) || undefined,
        blur: [body],
        mount: body.parentElement,
        before: body,
        hints: findHints(body, "hackernews"),
      });
    }

    const top = root.querySelector(".fatitem .toptext");
    if (top?.parentElement && textOf(top).length > 0) {
      const fat = top.closest(".fatitem");
      items.push({
        el: top,
        text: extractText(top),
        kind: "post",
        author: textOf(fat?.querySelector("a.hnuser")) || undefined,
        blur: [top],
        mount: top.parentElement,
        before: top,
        hints: findHints(top, "hackernews"),
      });
    }

    for (const row of Array.from(root.querySelectorAll("tr.athing:not(.comtr)"))) {
      const line = row.querySelector(".titleline");
      if (!line?.parentElement) continue;
      const link = line.querySelector("a");
      const sub = row.nextElementSibling?.querySelector(".subtext");
      items.push({
        el: row,
        text: textOf(link),
        kind: "title",
        author: textOf(sub?.querySelector("a.hnuser")) || undefined,
        blur: [line],
        mount: line.parentElement,
        before: line,
        hints: link ? findHints(line, "hackernews") : [],
      });
    }
    return items;
  },
};
