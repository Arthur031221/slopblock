import { chatbotLinkTag, isAiLabelText } from "../engine/site.ts";
import type { SiteHint } from "../engine/types.ts";

const BLOCK = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FOOTER",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TR",
  "UL",
]);

const SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "BUTTON",
  "TEMPLATE",
  "IFRAME",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "SLOPBLOCK-STRIP",
  "VIDEO",
  "AUDIO",
  "CANVAS",
]);

const HEADING = /^H[1-6]$/;

/**
 * Turn an element into text with light Markdown: paragraphs become blank lines, list items
 * get "- ", headings get "# " and bold spans keep their `**`. The engine reads these marks
 * the same way it reads pasted Markdown.
 */
export function extractText(root: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push((node.nodeValue ?? "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if (el.hasAttribute("hidden")) return;
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    if (tag === "IMG") {
      // X and some other sites render emoji as images with the emoji in alt.
      const alt = el.getAttribute("alt") ?? "";
      if (alt && [...alt].length <= 3) parts.push(alt);
      return;
    }
    const heading = HEADING.test(tag);
    const block = heading || BLOCK.has(tag);
    const bold = tag === "STRONG" || tag === "B";
    if (block) parts.push(tag === "P" ? "\n\n" : "\n");
    if (heading) parts.push("\n# ");
    if (tag === "LI") parts.push("- ");
    if (bold) parts.push("**");
    for (const child of Array.from(el.childNodes)) walk(child);
    if (bold) parts.push("**");
    if (block) parts.push("\n");
    if (tag === "P" || heading) parts.push("\n");
  };
  walk(root);
  return parts
    .join("")
    .replace(/\*\*\s*\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Look inside an item for chatbot link tags and, when `labelSelector` is given, for platform
 * AI labels. Labels are only read from those selectors so a comment that says "AI-generated"
 * in its text is not mistaken for a platform label.
 */
export function findHints(el: Element, site: string, labelSelector?: string): SiteHint[] {
  const hints: SiteHint[] = [];
  for (const a of Array.from(el.querySelectorAll("a[href]"))) {
    const tag = chatbotLinkTag(a.getAttribute("href") ?? "");
    if (tag) {
      hints.push({ id: "chatbot-link", site, detail: tag });
      break;
    }
  }
  if (!labelSelector) return hints;
  for (const node of Array.from(el.querySelectorAll(labelSelector))) {
    const candidates = [
      node.getAttribute("aria-label") ?? "",
      node.getAttribute("title") ?? "",
      textOf(node),
    ];
    const found = candidates.find((t) => t.length > 0 && t.length <= 40 && isAiLabelText(t));
    if (found) {
      hints.push({ id: "ai-label", site, detail: found.trim() });
      break;
    }
  }
  return hints;
}

export function first(root: ParentNode, selectors: string[]): Element | null {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

export function textOf(el: Element | null | undefined): string {
  return el ? (el.textContent ?? "").replace(/\s+/g, " ").trim() : "";
}

export function hostIs(host: string, ...domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}
