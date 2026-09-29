#!/usr/bin/env node
// Generates the machine half of the benchmark with a local Ollama server.
// The first topicLimit topics (prompts.json) x 4 genres x 2 models, written to
// bench/data/machine.jsonl. With topicLimit 20 that is 160 texts.
// Requests run one at a time. Rerunning the script skips ids already in the file.
//
// Usage: node bench/generate-machine.mjs [--host http://localhost:11434] [--topics N]

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hostArg = process.argv.indexOf("--host");
const HOST =
  (hostArg > -1 ? process.argv[hostArg + 1] : process.env.OLLAMA_HOST) || "http://localhost:11434";
const OUT = join(here, "data", "machine.jsonl");

const topics = JSON.parse(readFileSync(join(here, "topics.json"), "utf8"));
const prompts = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8"));
const genres = Object.keys(prompts.genres);
const topicsArg = process.argv.indexOf("--topics");
const TOPIC_LIMIT =
  Number(topicsArg > -1 ? process.argv[topicsArg + 1] : prompts.topicLimit) || topics.length;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function checkOllama() {
  let tags;
  try {
    const res = await fetch(`${HOST}/api/tags`);
    if (!res.ok) fail(`Ollama at ${HOST} answered ${res.status} on /api/tags`);
    tags = await res.json();
  } catch (err) {
    fail(`cannot reach Ollama at ${HOST} (${err.message}). Start it with "ollama serve".`);
  }
  const names = new Set((tags.models ?? []).map((m) => m.name));
  const missing = prompts.models.filter((m) => !names.has(m));
  if (missing.length > 0) {
    fail(
      `missing models: ${missing.join(", ")}. Pull them with: ${missing.map((m) => `ollama pull ${m}`).join(" && ")}`,
    );
  }
}

// Builds the full, deterministic job list. The running index sets both the id and the seed.
function jobs() {
  const list = [];
  let index = 0;
  for (const model of prompts.models) {
    topics.slice(0, TOPIC_LIMIT).forEach((t, ti) => {
      genres.forEach((genre, gi) => {
        const style = (ti + gi) % 2 === 0 ? "default" : "plain";
        const prompt = prompts.genres[genre].replace("{topic}", t.topic) + prompts.styles[style];
        list.push({
          id: `m-${String(index + 1).padStart(3, "0")}`,
          model,
          topic: t.id,
          source: genre,
          style,
          prompt,
          seed: prompts.seedBase + index,
        });
        index += 1;
      });
    });
  }
  return list;
}

function clean(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^[\s\S]*?<\/think>/, "")
    .trim();
}

// Settings come from prompts.json per model. "chat" mode uses /api/chat with the think flag.
// "raw" mode sends rawTemplate to /api/generate with a one-line closed think block, for
// thinking-only models that ignore think:false (see the notes in prompts.json).
function settingsFor(model) {
  const s = prompts.modelSettings?.[model];
  if (!s) fail(`prompts.json has no modelSettings entry for ${model}`);
  return s;
}

async function post(path, payload) {
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}: ${await res.text()}`);
  return res.json();
}

async function generate(job, seed) {
  const settings = settingsFor(job.model);
  const options = { ...prompts.options, num_predict: settings.num_predict, seed };
  if (settings.mode === "raw") {
    const prompt = prompts.rawTemplate
      .replace("{prompt}", job.prompt)
      .replace("{thinkPrefill}", settings.thinkPrefill);
    const body = await post("/api/generate", {
      model: job.model,
      prompt,
      raw: true,
      stream: false,
      options,
    });
    return clean(body.response ?? "");
  }
  const body = await post("/api/chat", {
    model: job.model,
    messages: [{ role: "user", content: job.prompt }],
    stream: false,
    think: settings.think,
    options,
  });
  return clean(body.message?.content ?? "");
}

// Reasoning that leaked into the answer text reads like a plan, not a post.
const LEAKED_REASONING =
  /^(we are (writing|asked)|okay, (the user|so|let)|the user (wants|is asking)|let me (think|draft))/i;
const usable = (text) => wordCount(text) >= 20 && !LEAKED_REASONING.test(text);

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

async function main() {
  await checkOllama();
  mkdirSync(dirname(OUT), { recursive: true });
  const done = new Set();
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, "utf8").split("\n")) {
      if (line.trim()) done.add(JSON.parse(line).id);
    }
  }
  const all = jobs();
  const todo = all.filter((j) => !done.has(j.id));
  console.log(
    `${all.length} jobs, ${done.size} already done, ${todo.length} to run against ${HOST}`,
  );
  const started = Date.now();
  let n = 0;
  for (const job of todo) {
    let seed = job.seed;
    let text = await generate(job, seed);
    if (!usable(text)) {
      seed = job.seed + 10000;
      text = await generate(job, seed);
    }
    if (!usable(text)) {
      console.warn(`${job.id}: no usable text after one retry, skipped`);
      continue;
    }
    const record = {
      id: job.id,
      label: "machine",
      source: job.source,
      style: job.style,
      model: job.model,
      mode: settingsFor(job.model).mode,
      topic: job.topic,
      prompt: job.prompt,
      seed,
      text,
    };
    appendFileSync(OUT, `${JSON.stringify(record)}\n`);
    n += 1;
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(
      `[${n}/${todo.length}] ${job.id} ${job.model} ${job.source} ${job.style} ${wordCount(text)} words, ${secs}s elapsed`,
    );
  }
  const total = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`done: ${n} new texts in ${total}s`);
}

main().catch((err) => fail(err.message));
