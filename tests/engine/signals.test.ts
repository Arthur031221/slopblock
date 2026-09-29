import { describe, expect, it } from "vitest";
import {
  broetrySignal,
  emDashSignal,
  emojiSignal,
  formattingSignals,
  hashtagSignal,
  negativeParallelSignal,
  rhetoricalSignal,
  titleSignal,
  tricolonSignal,
  uniformitySignal,
} from "../../src/engine/structure.ts";
import { analyze } from "../../src/engine/text.ts";
import { vocabularySignals } from "../../src/engine/vocabulary.ts";
import { LIST } from "../helpers.ts";

const doc = analyze;

describe("em dash density", () => {
  it("fires on em dashes and spaced en dashes", () => {
    const r = emDashSignal(doc("It works — mostly. The rest – well, later."));
    expect(r?.label).toBe("Em dashes x2");
  });
  it("ignores hyphens and a lone dash in a long text", () => {
    expect(emDashSignal(doc("a well-known state-of-the-art tool - fine"))).toBeNull();
    const long = `${"word ".repeat(600)}one — dash`;
    expect(emDashSignal(doc(long))).toBeNull();
  });
});

describe("negative parallelism", () => {
  it.each([
    "It's not a bug, it's a feature.",
    "This isn't a tool. It's a platform.",
    "Leadership isn't about titles. It's about trust.",
    "It is not just fast but also cheap.",
    "Not only fast but also cheap.",
    "No fluff, no filler, just results.",
    "It's less about the code and more about the people.",
  ])("fires on %s", (text) => {
    expect(negativeParallelSignal(doc(text))).not.toBeNull();
  });
  it("does not fire on plain negation", () => {
    expect(
      negativeParallelSignal(doc("It's not working on my machine. I tried twice.")),
    ).toBeNull();
  });
});

describe("rule of three", () => {
  it("fires on clipped triplets", () => {
    expect(tricolonSignal(doc("Fast. Simple. Private. That is the pitch."))?.id).toBe("tricolon");
  });
  it("fires on repeated lists of three", () => {
    const r = tricolonSignal(
      doc("It is fast, cheap, and reliable. Teams love the speed, the price, and the support."),
    );
    expect(r).not.toBeNull();
  });
  it("ignores a single list", () => {
    expect(
      tricolonSignal(doc("I bought eggs, milk, and bread on the way home from the office today.")),
    ).toBeNull();
  });
});

describe("emoji", () => {
  it("fires on emoji bullets", () => {
    expect(emojiSignal(doc("✅ Listen\n✅ Learn\n🚀 Ship"))?.label).toBe("Emoji bullets x3");
  });
  it("ignores a single emoji", () => {
    expect(emojiSignal(doc("nice work 🙂"))).toBeNull();
  });
});

describe("formatting", () => {
  it("counts bullets, headings and bold lead-ins in a comment", () => {
    const text = "## Summary\n- **Speed:** fast\n- **Cost:** low\n- **Risk:** none\nDone.";
    const ids = formattingSignals(doc(text), "comment").map((r) => r.id);
    expect(ids).toEqual(["bullets", "headings", "bold-leads"]);
  });
  it("does not count headings in articles", () => {
    const ids = formattingSignals(doc("# Title\nSome text"), "article").map((r) => r.id);
    expect(ids).not.toContain("headings");
  });
});

describe("sentence uniformity", () => {
  it("fires when every sentence has the same length", () => {
    const text = Array.from(
      { length: 8 },
      (_, i) => `This sentence number ${i} has exactly eight words.`,
    ).join(" ");
    expect(uniformitySignal(doc(text))).not.toBeNull();
  });
  it("stays quiet on bursty human text", () => {
    const text =
      "No. I tried that for a week and it made the build slower, not faster, because the cache kept getting invalidated by the timestamp in the header. Weird. Then I found the flag. It is documented nowhere except a comment in the source from 2014, which says do not use this in production. We use it in production.";
    expect(uniformitySignal(doc(text))).toBeNull();
  });
});

describe("hashtags, one-liners and rhetorical questions", () => {
  it("fires on a hashtag block", () => {
    expect(hashtagSignal(doc("Great day.\n#ai #growth #leadership"))).not.toBeNull();
  });
  it("fires on one-line paragraph posts", () => {
    expect(broetrySignal(doc("One.\n\nTwo.\n\nThree.\n\nFour.\n\nFive.\n\nSix."))).not.toBeNull();
  });
  it("fires on self-answered questions", () => {
    expect(
      rhetoricalSignal(doc("We cut the build in half. The result? Happier engineers.")),
    ).not.toBeNull();
  });
  it("fires on template titles", () => {
    expect(titleSignal(doc("Unlocking the Power of Rust: A Deep Dive"))).not.toBeNull();
    expect(titleSignal(doc("Show HN: A tiny SQLite browser in 400 lines"))).toBeNull();
  });
});

describe("vocabulary", () => {
  it("reports listed words with the form seen in the text", () => {
    const reasons = vocabularySignals(doc("Let us delve into this rich tapestry."), LIST);
    expect(reasons.find((r) => r.id === "words")?.label).toContain('"delve"');
  });
  it("counts openers only at the start", () => {
    const start = vocabularySignals(doc("Great question! It depends."), LIST);
    const middle = vocabularySignals(doc("That was a great question to ask me."), LIST);
    expect(start.some((r) => r.id === "opener")).toBe(true);
    expect(middle.some((r) => r.id === "opener")).toBe(false);
  });
  it("counts sign-offs only at the end", () => {
    const end = vocabularySignals(doc("Use restic.\n\nHope this helps!"), LIST);
    const start = vocabularySignals(
      doc("Hope this helps someone. Use restic for backups, it is fine."),
      LIST,
    );
    expect(end.some((r) => r.id === "signoff")).toBe(true);
    expect(start.some((r) => r.id === "signoff")).toBe(false);
  });
  it("needs two template markers before calling a post a template", () => {
    expect(vocabularySignals(doc("Agree?"), LIST).some((r) => r.id === "template")).toBe(false);
    expect(
      vocabularySignals(doc("Let that sink in.\n\nAgree?"), LIST).some((r) => r.id === "template"),
    ).toBe(true);
  });
});
