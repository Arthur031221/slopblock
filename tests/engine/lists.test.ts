import { describe, expect, it } from "vitest";
import { compileList, ENTRY_KINDS, phraseRegExp, validateList } from "../../src/engine/lists.ts";
import { DEFAULT_LIST } from "../helpers.ts";

describe("phraseRegExp", () => {
  it("matches whole phrases only", () => {
    const re = phraseRegExp("deep dive");
    expect("a deep dive into it".match(re)).toHaveLength(1);
    expect("a deep diver".match(re)).toBeNull();
  });

  it("treats * as a word wildcard", () => {
    expect("it plays a key role here".match(phraseRegExp("plays a * role"))).toHaveLength(1);
    expect("she delves deeper".match(phraseRegExp("delv*"))).toHaveLength(1);
  });

  it("matches curly apostrophes after normalization of the term", () => {
    expect("it's worth noting".match(phraseRegExp("it’s worth noting"))).toHaveLength(1);
  });

  it("handles terms that end in punctuation or are emoji", () => {
    expect("so. agree?".match(phraseRegExp("agree?"))).toHaveLength(1);
    expect("♻️ repost".match(phraseRegExp("♻️"))).toHaveLength(1);
  });
});

describe("compileList", () => {
  it("routes entries by kind and shape", () => {
    const c = compileList({
      version: 1,
      sources: [],
      entries: [
        { term: "delve", weight: 5, kind: "word" },
        { term: "delv*", weight: 5, kind: "word" },
        { term: "deep dive", weight: 5, kind: "word" },
        { term: "hope this helps", weight: 5, kind: "signoff" },
        { term: "broken", weight: 0, kind: "word" },
      ],
    });
    expect(c.exact.has("delve")).toBe(true);
    expect(c.prefix.map((p) => p.stem)).toEqual(["delv"]);
    expect(c.phrases).toHaveLength(1);
    expect(c.signoffs).toHaveLength(1);
    expect(c.exact.has("broken")).toBe(false);
  });
});

describe("validateList", () => {
  it("accepts a bare array and fills defaults", () => {
    const r = validateList([{ term: "Delve", weight: 3 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.list.entries[0]).toEqual({ term: "delve", weight: 3, kind: "word" });
  });

  it("reports bad weights, kinds and empty terms", () => {
    const r = validateList({
      entries: [
        { term: "", weight: 3 },
        { term: "x", weight: -1 },
        { term: "y", weight: 3, kind: "nope" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(3);
  });

  it("rejects things that are not lists", () => {
    expect(validateList("hello").ok).toBe(false);
    expect(validateList({}).ok).toBe(false);
  });

  it("drops duplicates", () => {
    const r = validateList([
      { term: "delve", weight: 3 },
      { term: "DELVE", weight: 4 },
    ]);
    expect(r.ok && r.list.entries.length).toBe(1);
  });
});

describe("lists/vocabulary.json", () => {
  it("is valid and has no duplicates", () => {
    const r = validateList(DEFAULT_LIST);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.list.entries.length).toBe(DEFAULT_LIST.entries.length);
  });

  it("attributes every entry to a declared source", () => {
    const ids = new Set(DEFAULT_LIST.sources.map((s) => s.id));
    for (const e of DEFAULT_LIST.entries) expect(ids.has(e.source ?? "")).toBe(true);
    for (const s of DEFAULT_LIST.sources) expect(s.title.length).toBeGreaterThan(0);
  });

  it("uses only known kinds and sane weights", () => {
    for (const e of DEFAULT_LIST.entries) {
      expect(ENTRY_KINDS).toContain(e.kind);
      expect(e.weight).toBeGreaterThan(0);
      expect(e.weight).toBeLessThanOrEqual(60);
    }
  });

  it("includes terms from the load-bearing vocabulary study", () => {
    const terms = DEFAULT_LIST.entries
      .filter((e) => e.source === "load-bearing")
      .map((e) => e.term);
    expect(terms).toContain("load-bearing");
    expect(terms.length).toBeGreaterThanOrEqual(20);
  });
});
