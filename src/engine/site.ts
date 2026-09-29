import type { Reason, SiteHint, SiteHintId } from "./types.ts";

/** Points for evidence found by a site adapter. These are not damped by text length. */
export const SITE_HINT_POINTS: Record<SiteHintId, number> = {
  // A platform label such as YouTube's "Altered or synthetic content" or LinkedIn's
  // "AI-generated". The poster or the platform said so, which beats any heuristic.
  "ai-label": 80,
  // C2PA Content Credentials on attached media. Often set by AI image tools, not always.
  "content-credentials": 30,
  // Links carrying utm_source=chatgpt.com and similar tags that chatbots append.
  "chatbot-link": 35,
};

const SITE_NAMES: Record<string, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  reddit: "Reddit",
  hackernews: "Hacker News",
  generic: "Page",
};

function siteName(site: string): string {
  return SITE_NAMES[site] ?? site;
}

export function siteSignals(hints: readonly SiteHint[] | undefined): Reason[] {
  if (!hints || hints.length === 0) return [];
  const byId = new Map<SiteHintId, SiteHint>();
  for (const h of hints) if (!byId.has(h.id)) byId.set(h.id, h);
  const out: Reason[] = [];
  for (const [id, h] of byId) {
    const points = SITE_HINT_POINTS[id];
    if (!points) continue;
    const name = siteName(h.site);
    if (id === "ai-label") {
      out.push({
        id,
        category: "site",
        label: `${name} AI label`,
        points,
        detail: `${name} marks this item as AI-generated or synthetic${h.detail ? `: "${h.detail}"` : ""}.`,
      });
    } else if (id === "content-credentials") {
      out.push({
        id,
        category: "site",
        label: "Content Credentials",
        points,
        detail: `Attached media carries C2PA Content Credentials${h.detail ? ` (${h.detail})` : ""}, which AI image tools often add.`,
      });
    } else if (id === "chatbot-link") {
      out.push({
        id,
        category: "site",
        label: "Chatbot link tag",
        points,
        detail: `A link carries a chatbot tracking tag${h.detail ? ` (${h.detail})` : ""}, which suggests the text was pasted from a chatbot.`,
      });
    }
  }
  return out;
}

const CHATBOT_UTM =
  /[?&]utm_source=(chatgpt\.com|openai|copilot\.com|perplexity|gemini|claude\.ai)\b/i;

/** Check a link for the tracking tags chatbots add to cited URLs. Pure, used by adapters. */
export function chatbotLinkTag(href: string): string | null {
  const m = CHATBOT_UTM.exec(href);
  return m ? `utm_source=${m[1]}` : null;
}

const AI_LABEL_TEXT =
  /^(?:ai[- ]generated(?: content)?|made with ai|ai info|generated (?:with|by) ai|created (?:with|using) ai|altered or synthetic content|synthetic content|ai-assisted)$/i;

/** True when a short label string is one of the platform AI disclosure labels. */
export function isAiLabelText(text: string): boolean {
  return AI_LABEL_TEXT.test(text.replace(/\s+/g, " ").trim());
}
