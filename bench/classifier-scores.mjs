// Scores the benchmark with a small ONNX text classifier through transformers.js, for the
// comparison in bench/results.md. Not part of the extension, and not a dependency:
//
//   npm install --no-save @huggingface/transformers@4.3.0
//   node bench/classifier-scores.mjs trentmkelly/slop-detector-mini-2
//
// Downloads the q8 model into bench/.cache (gitignored) and writes
// bench/data/classifier/<owner>__<name>.jsonl with {"id", "p_machine"} per text.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const modelId = process.argv[2];
if (!modelId) {
  console.error("usage: node bench/classifier-scores.mjs <huggingface model id> [cpu|wasm]");
  process.exit(1);
}

let transformers;
try {
  transformers = await import("@huggingface/transformers");
} catch {
  console.error(
    "@huggingface/transformers is not installed. Run: npm install --no-save @huggingface/transformers@4.3.0",
  );
  process.exit(1);
}
const { env, pipeline } = transformers;
env.cacheDir = path.join(ROOT, "bench/.cache/models");

const rows = ["human.jsonl", "machine.jsonl"].flatMap((f) =>
  fs
    .readFileSync(path.join(ROOT, "bench/data", f), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l)),
);

const clf = await pipeline("text-classification", modelId, {
  dtype: "q8",
  device: process.argv[3] ?? "cpu",
});
// Label names differ between models. These are the ones that mean "machine".
const MACHINE = new Set(["llm", "LABEL_1", "ai", "AI", "machine", "fake", "Fake"]);

const out = [];
const t0 = performance.now();
for (const r of rows) {
  const res = await clf(r.text, { top_k: null });
  const p = res.filter((x) => MACHINE.has(x.label)).reduce((a, x) => a + x.score, 0);
  out.push(JSON.stringify({ id: r.id, p_machine: p }));
}
const file = path.join(ROOT, "bench/data/classifier", `${modelId.replace("/", "__")}.jsonl`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${out.join("\n")}\n`);
console.log(
  `${rows.length} texts, ${((performance.now() - t0) / rows.length).toFixed(1)} ms each, wrote ${path.relative(ROOT, file)}`,
);
