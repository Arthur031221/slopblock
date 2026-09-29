import { countMatches, type Doc, round1, words as tokenize } from "./text.ts";
import type { ItemKind, Reason } from "./types.ts";
import { lengthNorm } from "./vocabulary.ts";

function reason(id: string, label: string, points: number, detail: string): Reason {
  return { id, category: "structure", label, points: round1(points), detail };
}

const EM_DASH = /—|\s–\s/g;

export function emDashSignal(doc: Doc): Reason | null {
  const count = countMatches(doc.norm, EM_DASH);
  if (count === 0 || doc.wordCount === 0) return null;
  const per100 = (count / doc.wordCount) * 100;
  if (per100 < 0.25) return null;
  const points = Math.min(26, 10 + 4 * count * lengthNorm(doc.wordCount));
  return reason(
    "em-dash",
    count === 1 ? "Em dash" : `Em dashes x${count}`,
    points,
    `${count} em dash${count === 1 ? "" : "es"} (${per100.toFixed(1)} per 100 words). Casual human writing rarely uses them.`,
  );
}

const SUBJ = "(?:it|this|that|they|we|you|he|she)";
const BE = "(?:'s|'re| is| are| was| were)";
const SEP = "(?:[,;:.!\\u2014\\u2013]|\\s-\\s)";
const NEGATIVE_PARALLELS: { re: RegExp; points: number }[] = [
  // it's not X, it's Y / this is not X. It is Y
  {
    re: new RegExp(`\\b${SUBJ}${BE} not\\b[^.!?\\n]{1,80}?${SEP}\\s*${SUBJ}${BE}\\b`, "gi"),
    points: 11,
  },
  // this isn't X. It's Y
  {
    re: new RegExp(
      `\\b${SUBJ} (?:isn't|aren't|wasn't|weren't)\\b[^.!?\\n]{1,80}?${SEP}\\s*${SUBJ}${BE}\\b`,
      "gi",
    ),
    points: 11,
  },
  // X isn't about Y. It's about Z
  {
    re: /\b(?:isn't|is not|aren't|are not|wasn't|was not) (?:just |only |really )?about\b[^.!?\n]{1,80}?(?:[,;:.!—–]|\s-\s)\s*(?:it's|it is|they're|this is|that's) (?:all )?about\b/gi,
    points: 11,
  },
  // not just X, but Y / not only X but also Y
  { re: /\bnot (?:just|only|merely|simply)\b[^.!?\n]{1,80}?\bbut(?: also)?\b/gi, points: 6 },
  // less about X and more about Y
  { re: /\bless about\b[^.!?\n]{1,60}?\bmore about\b/gi, points: 8 },
  // no X, no Y, just Z
  {
    re: /\bno [^.!?\n,]{1,30}, no [^.!?\n,]{1,30}(?:, no [^.!?\n,]{1,30})?[,.—–:]?\s*(?:just|only|simply)\b/gi,
    points: 9,
  },
];

export function negativeParallelSignal(doc: Doc): Reason | null {
  let count = 0;
  let points = 0;
  for (const { re, points: p } of NEGATIVE_PARALLELS) {
    const n = countMatches(doc.norm, re);
    count += n;
    points += n * p;
  }
  if (count === 0) return null;
  return reason(
    "not-x-but-y",
    count === 1 ? `"Not X, it's Y"` : `"Not X, it's Y" x${count}`,
    Math.min(28, points),
    `Negative parallelism ("it's not X, it's Y", "not just X but Y") found ${count} time${count === 1 ? "" : "s"}.`,
  );
}

const TRICOLON =
  /\b\p{L}[\p{L}'-]*(?:\s\p{L}[\p{L}'-]*){0,2},\s\p{L}[\p{L}'-]*(?:\s\p{L}[\p{L}'-]*){0,2},?\s(?:and|or)\s\p{L}[\p{L}'-]*/giu;

export function tricolonSignal(doc: Doc): Reason | null {
  let triples = 0;
  for (const s of doc.sentences) triples += countMatches(s, TRICOLON);
  // Three short sentences in a row: "Fast. Simple. Private."
  let staccato = 0;
  let run = 0;
  for (const s of doc.sentences) {
    const n = tokenize(s).length;
    if (n > 0 && n <= 4 && /[.!]$/.test(s)) {
      run++;
      if (run === 3) staccato++;
    } else {
      run = 0;
    }
  }
  const per100 = doc.wordCount > 0 ? (triples / doc.wordCount) * 100 : 0;
  let points = 0;
  if (triples >= 2 && per100 >= 0.8) points += Math.min(12, 4 * (triples - 1));
  points += Math.min(14, staccato * 7);
  if (points === 0) return null;
  const parts: string[] = [];
  if (triples > 0) parts.push(`${triples} lists of three`);
  if (staccato > 0) parts.push(`${staccato} runs of three clipped sentences`);
  return reason(
    "tricolon",
    staccato > 0 && triples < 2 ? "Clipped triplets" : `Rule of three x${triples + staccato}`,
    points,
    `${parts.join(" and ")}. Language models lean on groups of three.`,
  );
}

const PICTO = /\p{Extended_Pictographic}/gu;
const PICTO_START = /^(?:[-*•]\s*)?\p{Extended_Pictographic}/u;

export function emojiSignal(doc: Doc): Reason | null {
  const headers = doc.lines.filter((l) => PICTO_START.test(l)).length;
  const total = countMatches(doc.norm, PICTO);
  let points = 0;
  if (headers >= 2) points += Math.min(20, 8 + 4 * (headers - 2));
  const per100 = doc.wordCount > 0 ? (total / doc.wordCount) * 100 : 0;
  if (total >= 4 && per100 >= 2) points += 6;
  if (points === 0) return null;
  return reason(
    "emoji",
    headers >= 2 ? `Emoji bullets x${headers}` : `Emoji x${total}`,
    points,
    `${headers} lines start with an emoji, ${total} emoji in total.`,
  );
}

const BULLET = /^(?:[-*•◦▪‣➡→]|\d{1,2}[.)])\s+\S/u;
const HEADING = /^#{1,6}\s+\S/;
const BOLD_LEAD = /^(?:[-*•]\s*|\d{1,2}[.)]\s*)?\*\*[^*\n]{2,80}\*\*/;

export function formattingSignals(doc: Doc, kind: ItemKind): Reason[] {
  const out: Reason[] = [];
  const scale = kind === "article" ? 0.5 : 1;
  const bullets = doc.lines.filter((l) => BULLET.test(l)).length;
  const ratio = doc.lines.length > 0 ? bullets / doc.lines.length : 0;
  if (bullets >= 3 && ratio >= 0.3) {
    out.push(
      reason(
        "bullets",
        `Bullet list x${bullets}`,
        Math.min(10, 4 + 6 * ratio) * scale,
        `${bullets} of ${doc.lines.length} lines are list items.`,
      ),
    );
  }
  const headings = doc.lines.filter((l) => HEADING.test(l)).length;
  if (headings >= 1 && kind !== "article") {
    out.push(
      reason(
        "headings",
        `Markdown headings x${headings}`,
        Math.min(16, 6 + 4 * (headings - 1)),
        `${headings} Markdown headings in a ${kind}. People rarely add headings to a ${kind}.`,
      ),
    );
  }
  const bold = doc.lines.filter((l) => BOLD_LEAD.test(l)).length;
  const inlineBold = countMatches(doc.norm, /\*\*[^*\n]{2,80}\*\*/g);
  if (bold >= 2 || inlineBold >= 3) {
    out.push(
      reason(
        "bold-leads",
        `Bold lead-ins x${Math.max(bold, inlineBold)}`,
        Math.min(15, 6 + 3 * Math.max(0, Math.max(bold, inlineBold) - 2)) * scale,
        `${bold} lines start with a bold label, ${inlineBold} bold spans in total.`,
      ),
    );
  }
  return out;
}

export function uniformitySignal(doc: Doc): Reason | null {
  const lengths = doc.sentences.map((s) => tokenize(s).length).filter((n) => n >= 3);
  if (lengths.length < 6) return null;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  const cv = sd / mean;
  if (cv >= 0.4) return null;
  return reason(
    "uniform",
    "Uniform sentences",
    Math.min(12, (0.4 - cv) * 60),
    `Sentence lengths vary little (coefficient of variation ${cv.toFixed(2)} over ${lengths.length} sentences). Human writing is usually burstier.`,
  );
}

const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]{2,}/gu;

export function hashtagSignal(doc: Doc): Reason | null {
  const total = countMatches(doc.norm, HASHTAG);
  const lastLines = doc.lines.slice(-2).join(" ");
  const trailing = countMatches(lastLines, HASHTAG);
  if (trailing < 3 && total < 5) return null;
  return reason(
    "hashtags",
    `Hashtag block x${total}`,
    total >= 5 ? 10 : 8,
    `${total} hashtags, ${trailing} of them in the closing lines.`,
  );
}

export function broetrySignal(doc: Doc): Reason | null {
  if (doc.paragraphs.length < 6) return null;
  const single = doc.paragraphs.filter(
    (p) => p.length <= 160 && !p.includes("\n") && (p.match(/[.!?](\s|$)/g) ?? []).length <= 1,
  ).length;
  const ratio = single / doc.paragraphs.length;
  if (ratio < 0.75) return null;
  return reason(
    "one-liners",
    "One-line paragraphs",
    6,
    `${single} of ${doc.paragraphs.length} paragraphs are a single short sentence.`,
  );
}

const RHETORICAL =
  /(?:^|[.!?\n]\s*)(?:the|and the|but the|so the|the real|the best|the result|the catch|the kicker)\s+(?:[\p{L}'-]+\s+){0,3}[\p{L}'-]+\?\s+(?=["\p{Lu}\p{N}])/gimu;
const WHY_BECAUSE = /\bwhy\?\s+because\b/gi;

export function rhetoricalSignal(doc: Doc): Reason | null {
  const count = countMatches(doc.norm, RHETORICAL) + countMatches(doc.norm, WHY_BECAUSE);
  if (count === 0) return null;
  return reason(
    "rhetorical",
    `Self-answered question${count > 1 ? ` x${count}` : ""}`,
    Math.min(18, 10 * count),
    `"The result? ..." style questions answered in the next breath, ${count} found.`,
  );
}

const TITLE_PATTERNS: RegExp[] = [
  /^(?:unlocking|unleashing|mastering|harnessing|navigating|embracing|demystifying|revolutionizing|elevating|supercharging|empowering)\b/i,
  /\b(?:ultimate|complete|comprehensive|definitive) guide\b/i,
  /\beverything you need to know\b/i,
  /\bgame[- ]chang(?:er|ing)\b/i,
  /: (?:a|an|the) (?:deep dive|journey|game changer|new era|paradigm shift)\b/i,
  /^\p{Extended_Pictographic}/u,
];

export function titleSignal(doc: Doc): Reason | null {
  const hits = TITLE_PATTERNS.filter((re) => re.test(doc.norm)).length;
  if (hits === 0) return null;
  return reason(
    "title-template",
    "Template title",
    Math.min(24, 12 * hits),
    "The title follows a common generated-headline template.",
  );
}

export function structureSignals(doc: Doc, kind: ItemKind): Reason[] {
  if (kind === "title") {
    return [titleSignal(doc), emDashSignal(doc)].filter((r): r is Reason => r !== null);
  }
  const out: (Reason | null)[] = [
    emDashSignal(doc),
    negativeParallelSignal(doc),
    tricolonSignal(doc),
    emojiSignal(doc),
    ...formattingSignals(doc, kind),
    uniformitySignal(doc),
    hashtagSignal(doc),
    broetrySignal(doc),
    rhetoricalSignal(doc),
  ];
  return out.filter((r): r is Reason => r !== null && r.points > 0);
}
