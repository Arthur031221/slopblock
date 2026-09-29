#!/usr/bin/env node
// Builds the human half of the benchmark from public text written before 2021.
// Sources: Hacker News comments, Show HN and Ask HN story texts (HN Algolia API),
// and Reddit self posts from before 2022 when Reddit answers without a login.
// Raw API responses are cached in bench/.cache so a rerun is offline and reproducible.
//
// Usage: node bench/fetch-human.mjs [--no-reddit]

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = join(here, ".cache");
const OUT = join(here, "data", "human.jsonl");
const USER_AGENT = "slopblock-bench/0.1 (builds a small labeled dataset, one request at a time)";

// HN items must be created in 2010 to 2020, Reddit items before 2022.
const HN_AFTER = 1262304000; // 2010-01-01
const HN_BEFORE = 1609459200; // 2021-01-01
const REDDIT_BEFORE = 1640995200; // 2022-01-01

const COMMENTS_PER_TOPIC = 5;
const COMMENTS_PER_TOPIC_NO_REDDIT = 7;
const STORIES_PER_TOPIC = 2;
const REDDIT_PER_TOPIC = 2;

const topics = JSON.parse(readFileSync(join(here, "topics.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${createHash("sha1").update(url).digest("hex")}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  await sleep(300);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "manual" });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) throw new Error(`non-JSON answer (${type}) for ${url}`);
  const body = await res.json();
  writeFileSync(file, JSON.stringify(body));
  return body;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// HN text uses <p> between paragraphs, <a>, <i> and <pre><code>.
function cleanHtml(html) {
  const text = html
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return normalize(unescapeHtml(text));
}

function normalize(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/[ \t\f\v ]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

const STOPWORDS = new Set([
  "the",
  "and",
  "to",
  "of",
  "a",
  "is",
  "that",
  "it",
  "in",
  "for",
  "you",
  "i",
  "with",
  "this",
  "but",
  "on",
]);

// Rejects text that is too short or long, not English, mostly links or code, or mostly quotes.
function acceptable(text, raw = "") {
  if (text.length < 150 || text.length > 1500) return false;
  if (/\[(deleted|removed)\]/i.test(text)) return false;
  if (/<pre>|<code>/i.test(raw)) return false;
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.filter((w) => STOPWORDS.has(w)).length < 4) return false;
  const nonAscii = [...text].filter((c) => (c.codePointAt(0) ?? 0) > 127).length;
  if (nonAscii / text.length > 0.03) return false;
  const urlChars = (text.match(/https?:\/\/\S+/g) ?? []).join("").length;
  if (urlChars / text.length > 0.3) return false;
  const codeish = (text.match(/[{};=<>]|=>|\(\)/g) ?? []).length;
  if (codeish / text.length > 0.02) return false;
  const lines = text.split("\n").filter((l) => l.trim());
  const quoted = lines.filter((l) => l.trim().startsWith(">")).join("").length;
  if (quoted / text.length > 0.5) return false;
  return true;
}

function hnSearch(tags, query) {
  const q = encodeURIComponent(query);
  const filter = encodeURIComponent(`created_at_i<${HN_BEFORE},created_at_i>${HN_AFTER}`);
  return `https://hn.algolia.com/api/v1/search?tags=${tags}&query=${q}&numericFilters=${filter}&hitsPerPage=50`;
}

const seenText = new Set();
const items = [];

function add(record) {
  const key = record.text.toLowerCase().replace(/\s+/g, " ").slice(0, 200);
  if (seenText.has(key)) return false;
  seenText.add(key);
  items.push(record);
  return true;
}

async function hnComments(topic, perTopic) {
  const data = await getJson(hnSearch("comment", topic.hnQuery));
  const stories = new Set();
  let n = 0;
  for (const hit of data.hits) {
    if (n >= perTopic) break;
    const raw = hit.comment_text ?? "";
    const text = cleanHtml(raw);
    if (!acceptable(text, raw) || stories.has(hit.story_id)) continue;
    const ok = add({
      label: "human",
      source: "hn_comment",
      topic: topic.id,
      url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      created_at: hit.created_at,
      text,
    });
    if (ok) {
      stories.add(hit.story_id);
      n += 1;
    }
  }
  return n;
}

async function hnStories(topic, tag, source) {
  // The topic query first, then its first keyword as a broader fallback.
  const queries = [topic.hnQuery, topic.hnQuery.split(" ")[0]];
  let n = 0;
  for (const query of queries) {
    const data = await getJson(hnSearch(tag, query));
    for (const hit of data.hits) {
      if (n >= STORIES_PER_TOPIC) return n;
      const raw = hit.story_text ?? "";
      const text = cleanHtml(raw);
      if (!acceptable(text, raw)) continue;
      const ok = add({
        label: "human",
        source,
        topic: topic.id,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        created_at: hit.created_at,
        text,
      });
      if (ok) n += 1;
    }
    if (n > 0) return n;
  }
  return n;
}

async function redditAvailable() {
  try {
    await getJson("https://old.reddit.com/r/Cooking/top.json?t=all&limit=1");
    return true;
  } catch (err) {
    console.warn(`Reddit is not reachable without a login (${err.message}). Skipping Reddit.`);
    return false;
  }
}

async function redditPosts(topic) {
  let n = 0;
  for (const sub of topic.subreddits) {
    if (n >= REDDIT_PER_TOPIC) break;
    let data;
    try {
      data = await getJson(`https://old.reddit.com/r/${sub}/top.json?t=all&limit=100`);
    } catch (err) {
      console.warn(`r/${sub}: ${err.message}`);
      continue;
    }
    for (const child of data?.data?.children ?? []) {
      if (n >= REDDIT_PER_TOPIC) break;
      const post = child.data;
      if (!post?.is_self || post.created_utc >= REDDIT_BEFORE) continue;
      const text = normalize(unescapeHtml(post.selftext ?? ""));
      if (!acceptable(text)) continue;
      const ok = add({
        label: "human",
        source: "reddit_post",
        topic: topic.id,
        url: `https://www.reddit.com${post.permalink}`,
        created_at: new Date(post.created_utc * 1000).toISOString(),
        text,
      });
      if (ok) n += 1;
    }
  }
  return n;
}

async function main() {
  const useReddit = !process.argv.includes("--no-reddit") && (await redditAvailable());
  const perTopic = useReddit ? COMMENTS_PER_TOPIC : COMMENTS_PER_TOPIC_NO_REDDIT;
  for (const topic of topics) {
    const c = await hnComments(topic, perTopic);
    const s = await hnStories(topic, "show_hn", "show_hn");
    const a = await hnStories(topic, "ask_hn", "ask_hn");
    const r = useReddit ? await redditPosts(topic) : 0;
    console.log(`${topic.id}: ${c} comments, ${s} show_hn, ${a} ask_hn, ${r} reddit`);
  }
  mkdirSync(dirname(OUT), { recursive: true });
  const lines = items.map((item, i) =>
    JSON.stringify({ id: `h-${String(i + 1).padStart(3, "0")}`, ...item }),
  );
  writeFileSync(OUT, `${lines.join("\n")}\n`);
  const bySource = {};
  for (const item of items) bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  console.log(`wrote ${items.length} human texts to ${OUT}`, bySource);
  if (items.length < 160) {
    console.error(`error: only ${items.length} human texts, the benchmark needs at least 160`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
