// Scores the labeled benchmark with the heuristic engine and writes bench/results.md and
// bench/results.json. Usage: node bench/run.ts [--classifier scores.jsonl] [--check]
//
// The set is split in two by a hash of each id. Weights and the default threshold were tuned
// on the dev half only. The headline numbers come from the test half.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileList } from "../src/engine/lists.ts";
import { DEFAULT_THRESHOLD, scoreText } from "../src/engine/score.ts";
import type { ItemKind, WordList } from "../src/engine/types.ts";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);

interface Sample {
  id: string;
  label: "human" | "machine";
  source: string;
  topic: string;
  model?: string;
  style?: string;
  text: string;
  url?: string;
  created_at?: string;
}

interface Scored extends Sample {
  split: "dev" | "test";
  score: number;
  reasons: string[];
  classifier?: number;
}

function readJsonl(path: string): Sample[] {
  if (!existsSync(path)) {
    console.error(
      `missing ${path}. Run bench/fetch-human.mjs and bench/generate-machine.mjs first.`,
    );
    process.exit(1);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Sample);
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const KIND: Record<string, ItemKind> = {
  hn_comment: "comment",
  reddit_reply: "comment",
  reddit_comment: "comment",
  linkedin_post: "post",
  product_blurb: "post",
  show_hn: "post",
  ask_hn: "post",
  reddit_post: "post",
};

interface Metrics {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
}

function metrics(rows: { label: string; value: number }[], threshold: number): Metrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const r of rows) {
    const flagged = r.value >= threshold;
    if (r.label === "machine") {
      if (flagged) tp++;
      else fn++;
    } else if (flagged) fp++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    threshold,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    f1,
    fpr: fp + tn > 0 ? fp / (fp + tn) : 0,
  };
}

/** ROC AUC by the rank statistic. */
function auc(rows: { label: string; value: number }[]): number {
  const pos = rows.filter((r) => r.label === "machine").map((r) => r.value);
  const neg = rows.filter((r) => r.label === "human").map((r) => r.value);
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return pos.length && neg.length ? wins / (pos.length * neg.length) : 0;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(2);

// ---------------------------------------------------------------------------------------------

const list = compileList(
  JSON.parse(readFileSync(join(ROOT, "lists/vocabulary.json"), "utf8")) as WordList,
);
const human = readJsonl(join(ROOT, "bench/data/human.jsonl"));
const machine = readJsonl(join(ROOT, "bench/data/machine.jsonl"));

const classifierPath = args.includes("--classifier")
  ? args[args.indexOf("--classifier") + 1]
  : undefined;
const classifier = new Map<string, number>();
if (classifierPath) {
  for (const line of readFileSync(classifierPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { id: string; p_machine: number };
    classifier.set(r.id, r.p_machine);
  }
}

const t0 = performance.now();
const scored: Scored[] = [...human, ...machine].map((s) => {
  const r = scoreText(s.text, list, { kind: KIND[s.source] ?? "post" });
  const row: Scored = {
    ...s,
    split: fnv(s.id) % 2 === 0 ? "dev" : "test",
    score: r.score,
    reasons: r.reasons.map((x) => x.id),
  };
  const c = classifier.get(s.id);
  if (c !== undefined) row.classifier = c;
  return row;
});
const msPerText = (performance.now() - t0) / scored.length;

const bySplit = (split?: "dev" | "test") => scored.filter((s) => !split || s.split === split);
const values = (rows: Scored[]) => rows.map((r) => ({ label: r.label, value: r.score }));

const test = bySplit("test");
const dev = bySplit("dev");
const atDefault = {
  test: metrics(values(test), DEFAULT_THRESHOLD),
  dev: metrics(values(dev), DEFAULT_THRESHOLD),
  all: metrics(values(scored), DEFAULT_THRESHOLD),
};
const curve = Array.from({ length: 17 }, (_, i) => 10 + i * 5).map((t) => ({
  threshold: t,
  dev: metrics(values(dev), t),
  test: metrics(values(test), t),
}));
const bestDev = [...curve].sort((a, b) => b.dev.f1 - a.dev.f1)[0];

function recallBy(key: (s: Scored) => string | undefined): [string, number, number][] {
  const groups = new Map<string, Scored[]>();
  for (const s of test.filter((x) => x.label === "machine")) {
    const k = key(s) ?? "unknown";
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, rows]) => [
      k,
      rows.filter((r) => r.score >= DEFAULT_THRESHOLD).length / rows.length,
      rows.length,
    ]);
}

function fprBy(key: (s: Scored) => string): [string, number, number][] {
  const groups = new Map<string, Scored[]>();
  for (const s of test.filter((x) => x.label === "human")) {
    const k = key(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, rows]) => [
      k,
      rows.filter((r) => r.score >= DEFAULT_THRESHOLD).length / rows.length,
      rows.length,
    ]);
}

const reasonFreq = (label: "human" | "machine") => {
  const rows = scored.filter((s) => s.label === label);
  const counts = new Map<string, number>();
  for (const r of rows)
    for (const id of new Set(r.reasons)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Map([...counts].map(([k, v]) => [k, v / rows.length]));
};
const humanReasons = reasonFreq("human");
const machineReasons = reasonFreq("machine");
const reasonIds = [...new Set([...humanReasons.keys(), ...machineReasons.keys()])].sort(
  (a, b) => (machineReasons.get(b) ?? 0) - (machineReasons.get(a) ?? 0),
);

const falsePositives = test
  .filter((s) => s.label === "human" && s.score >= DEFAULT_THRESHOLD)
  .sort((a, b) => b.score - a.score);
const misses = test.filter((s) => s.label === "machine" && s.score < DEFAULT_THRESHOLD);

// Optional classifier comparison.
let classifierSection = "";
if (classifier.size > 0) {
  const withC = test.filter((s) => s.classifier !== undefined);
  const cRows = withC.map((r) => ({ label: r.label, value: (r.classifier ?? 0) * 100 }));
  const hRows = withC.map((r) => ({ label: r.label, value: r.score }));
  const cBest = Array.from({ length: 19 }, (_, i) => 5 + i * 5)
    .map((t) => metrics(cRows, t))
    .sort((a, b) => b.f1 - a.f1)[0];
  classifierSection = [
    "## Classifier comparison",
    "",
    `Scores from \`${classifierPath}\` on the ${withC.length} test texts that have one.`,
    "",
    "| | ROC AUC | F1 at 0.5 | Best F1 (threshold) |",
    "|---|---|---|---|",
    `| Heuristics | ${f2(auc(hRows))} | ${f2(metrics(hRows, DEFAULT_THRESHOLD).f1)} (at ${DEFAULT_THRESHOLD}) | ${f2(Math.max(...Array.from({ length: 17 }, (_, i) => metrics(hRows, 10 + i * 5).f1)))} |`,
    `| Classifier | ${f2(auc(cRows))} | ${f2(metrics(cRows, 50).f1)} | ${f2(cBest?.f1 ?? 0)} (${((cBest?.threshold ?? 0) / 100).toFixed(2)}) |`,
    "",
  ].join("\n");
}

const prompts = JSON.parse(readFileSync(join(ROOT, "bench/prompts.json"), "utf8"));
const countBy = (rows: Sample[], key: (s: Sample) => string | undefined) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r) ?? "unknown", (m.get(key(r) ?? "unknown") ?? 0) + 1);
  return [...m].sort(([a], [b]) => a.localeCompare(b));
};

const md: string[] = [
  "# Benchmark results",
  "",
  "Generated by `npm run bench` from `bench/data/`. Do not edit by hand.",
  "",
  "## Headline",
  "",
  `On the held-out test half (${test.length} texts), at the default threshold of ${DEFAULT_THRESHOLD}:`,
  "",
  "| Split | n | Precision | Recall | F1 | False positive rate | ROC AUC |",
  "|---|---|---|---|---|---|---|",
  ...(["test", "dev", "all"] as const).map((k) => {
    const m = atDefault[k];
    const rows = k === "all" ? scored : bySplit(k);
    return `| ${k} | ${rows.length} | ${pct(m.precision)} | ${pct(m.recall)} | ${f2(m.f1)} | ${pct(m.fpr)} | ${f2(auc(values(rows)))} |`;
  }),
  "",
  `Test confusion at ${DEFAULT_THRESHOLD}: ${atDefault.test.tp} machine texts flagged, ${atDefault.test.fn} missed, ${atDefault.test.fp} human texts flagged, ${atDefault.test.tn} left alone.`,
  "",
  "## Threshold curve",
  "",
  "The popup slider moves this threshold. Lower catches more and misfires more.",
  "",
  "| Threshold | Dev precision | Dev recall | Dev F1 | Test precision | Test recall | Test F1 | Test FPR |",
  "|---|---|---|---|---|---|---|---|",
  ...curve.map(
    (c) =>
      `| ${c.threshold}${c.threshold === DEFAULT_THRESHOLD ? " (default)" : ""} | ${pct(c.dev.precision)} | ${pct(c.dev.recall)} | ${f2(c.dev.f1)} | ${pct(c.test.precision)} | ${pct(c.test.recall)} | ${f2(c.test.f1)} | ${pct(c.test.fpr)} |`,
  ),
  "",
  `The best dev F1 is at ${bestDev?.threshold}. The default sits at ${DEFAULT_THRESHOLD} to keep false positives low, because a wrongly blurred human post costs more than a missed machine one.`,
  "",
  "## Recall by group (test half)",
  "",
  "| Group | Recall | n |",
  "|---|---|---|",
  ...recallBy((s) => `model ${s.model}`).map(([k, r, n]) => `| ${k} | ${pct(r)} | ${n} |`),
  ...recallBy((s) => `style ${s.style}`).map(([k, r, n]) => `| ${k} | ${pct(r)} | ${n} |`),
  ...recallBy((s) => `genre ${s.source}`).map(([k, r, n]) => `| ${k} | ${pct(r)} | ${n} |`),
  "",
  "## False positive rate by human source (test half)",
  "",
  "| Source | FPR | n |",
  "|---|---|---|",
  ...fprBy((s) => s.source).map(([k, r, n]) => `| ${k} | ${pct(r)} | ${n} |`),
  "",
  "## Which signals fire",
  "",
  "Share of texts in which each reason appears, whole set.",
  "",
  "| Reason | Human | Machine |",
  "|---|---|---|",
  ...reasonIds.map(
    (id) => `| ${id} | ${pct(humanReasons.get(id) ?? 0)} | ${pct(machineReasons.get(id) ?? 0)} |`,
  ),
  "",
  "## Human texts flagged in the test half",
  "",
  falsePositives.length === 0
    ? "None at the default threshold."
    : falsePositives
        .slice(0, 10)
        .map(
          (s) =>
            `- ${s.id} (${s.source}, score ${s.score}, ${s.reasons.slice(0, 3).join(", ")}): ${s.url ?? ""}`,
        )
        .join("\n"),
  "",
  `Machine texts missed in the test half: ${misses.length}. Most are from the plain style prompt, which asks for no Markdown, no lists and no emoji.`,
  "",
  classifierSection,
  "## Method",
  "",
  "### Human texts",
  "",
  `${human.length} texts written before 2021-01-01, before large language models were public. Sources:`,
  "",
  ...countBy(human, (s) => s.source).map(([k, n]) => `- ${k}: ${n}`),
  "",
  "Hacker News comments, Show HN and Ask HN texts come from the HN Algolia API with `numericFilters=created_at_i<1609459200`, queried by topic keywords from `bench/topics.json`. Each record keeps its URL and date. See `bench/fetch-human.mjs`.",
  "",
  "### Machine texts",
  "",
  `${machine.length} texts generated locally with Ollama on a MacBook Air (M5, 24 GB) on 2026-09-30:`,
  "",
  ...countBy(machine, (s) => `${s.model}, ${s.style}`).map(([k, n]) => `- ${k}: ${n}`),
  "",
  "Genres match the human side: Hacker News comments, LinkedIn posts, product launch blurbs and Reddit replies, on the same topics. Half of the prompts add a plain style instruction that asks for no Markdown, lists, emoji or hashtags. Settings: temperature 0.8, top_p 0.95, thinking off, a fixed seed per text. See `bench/generate-machine.mjs`.",
  "",
  "Exact prompt templates (`{topic}` is replaced by the topic name):",
  "",
  "```json",
  JSON.stringify(prompts, null, 2),
  "```",
  "",
  "### Split and tuning",
  "",
  "Each text goes to the dev or test half by the parity of a 32-bit FNV-1a hash of its id. List weights, signal thresholds and the default blur threshold were adjusted while looking at dev results only. The test half was scored once the weights were fixed.",
  "",
  "## Limits",
  "",
  "- The machine texts come from two small local models (Qwen3 4B and 1.7B). Most slop people meet in feeds comes from frontier models (GPT-5 class, Claude, Gemini), which write with fewer obvious tells. Expect lower recall in the wild than shown here.",
  "- The human texts are mostly Hacker News, which skews toward terse technical writing. Marketing copy and LinkedIn posts written by people before 2021 are underrepresented, so the false positive rate on those genres is probably higher than shown.",
  "- The benchmark scores raw text. On real pages, adapters also add platform labels (YouTube, LinkedIn), which this set does not exercise.",
  "- A few hundred texts give wide error bars: a 95% interval on a proportion near 80% with n = 100 is about plus or minus 8 points.",
  "",
];

const out = md.join("\n");
if (args.includes("--check")) {
  const current = existsSync(join(ROOT, "bench/results.md"))
    ? readFileSync(join(ROOT, "bench/results.md"), "utf8")
    : "";
  if (current !== out) {
    console.error("bench/results.md is out of date. Run npm run bench.");
    process.exit(1);
  }
} else {
  writeFileSync(join(ROOT, "bench/results.md"), out);
  writeFileSync(
    join(ROOT, "bench/results.json"),
    `${JSON.stringify({ threshold: DEFAULT_THRESHOLD, atDefault, curve, n: { human: human.length, machine: machine.length } }, null, 2)}\n`,
  );
}

const m = atDefault.test;
console.log(
  `test n=${test.length}: precision ${pct(m.precision)}, recall ${pct(m.recall)}, F1 ${f2(m.f1)}, FPR ${pct(m.fpr)}, AUC ${f2(auc(values(test)))} at threshold ${DEFAULT_THRESHOLD}`,
);
console.log(`scoring speed ${msPerText.toFixed(2)} ms per text`);
console.log(`dev best F1 ${f2(bestDev?.dev.f1 ?? 0)} at threshold ${bestDev?.threshold}`);
if (args.includes("--signals")) {
  // Per-signal firing rate and mean points on the dev half, for tuning.
  const stat = new Map<string, { h: number; m: number }>();
  const devH = dev.filter((r) => r.label === "human").length;
  const devM = dev.length - devH;
  for (const r of dev) {
    for (const id of new Set(r.reasons)) {
      const s = stat.get(id) ?? { h: 0, m: 0 };
      if (r.label === "human") s.h++;
      else s.m++;
      stat.set(id, s);
    }
  }
  console.log(`dev: ${devH} human, ${devM} machine`);
  for (const [id, s] of [...stat].sort((a, b) => b[1].m / devM - a[1].m / devM)) {
    console.log(
      `${id.padEnd(16)} human ${pct(s.h / devH).padStart(6)}  machine ${pct(s.m / devM).padStart(6)}`,
    );
  }
  for (const c of curve) {
    console.log(
      `t=${c.threshold} dev precision ${pct(c.dev.precision)} recall ${pct(c.dev.recall)} fpr ${pct(c.dev.fpr)} f1 ${f2(c.dev.f1)}`,
    );
  }
}
if (args.includes("--dump")) {
  for (const s of scored.filter((x) => x.split === "dev").sort((a, b) => b.score - a.score)) {
    console.log(
      `${s.label}\t${s.score}\t${s.source}\t${s.style ?? ""}\t${s.reasons.join(",")}\t${s.text.slice(0, 80).replace(/\n/g, " ")}`,
    );
  }
}
