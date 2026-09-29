import { describe, expect, it } from "vitest";
import { analyze, normalize, paragraphs, sentences, words } from "../../src/engine/text.ts";

describe("text helpers", () => {
  it("straightens curly quotes and apostrophes", () => {
    expect(normalize("“It’s fine”")).toBe('"It\'s fine"');
  });

  it("keeps hyphenated words and contractions as single tokens", () => {
    expect(words("A load-bearing wall isn't cheap.")).toEqual([
      "a",
      "load-bearing",
      "wall",
      "isn't",
      "cheap",
    ]);
  });

  it("splits sentences on punctuation and newlines but not on e.g.", () => {
    expect(sentences("Use a tool, e.g. restic. It works!\nNext line")).toEqual([
      "Use a tool, e.g. restic.",
      "It works!",
      "Next line",
    ]);
  });

  it("splits paragraphs on blank lines", () => {
    expect(paragraphs("one\n\ntwo\nstill two\n\n\nthree")).toEqual([
      "one",
      "two\nstill two",
      "three",
    ]);
  });

  it("analyzes an empty string without failing", () => {
    const doc = analyze("");
    expect(doc.wordCount).toBe(0);
    expect(doc.sentences).toEqual([]);
  });
});
