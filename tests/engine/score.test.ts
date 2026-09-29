import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLD, lengthDamping, scoreText, toScore } from "../../src/engine/score.ts";
import { chatbotLinkTag, isAiLabelText } from "../../src/engine/site.ts";
import { HUMAN_COMMENT, LIST, SLOP_COMMENT, SLOP_LINKEDIN } from "../helpers.ts";

describe("scoreText", () => {
  it("scores a typical chatbot comment above the default threshold", () => {
    const r = scoreText(SLOP_COMMENT, LIST, { kind: "comment" });
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("scores a plain human comment near zero", () => {
    const r = scoreText(HUMAN_COMMENT, LIST, { kind: "comment" });
    expect(r.score).toBeLessThan(15);
  });

  it("scores a LinkedIn template post above the threshold", () => {
    const r = scoreText(SLOP_LINKEDIN, LIST, { kind: "post" });
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(r.reasons.map((x) => x.id)).toContain("template");
  });

  it("sorts reasons by points and sums them into raw", () => {
    const r = scoreText(SLOP_COMMENT, LIST, { kind: "comment" });
    const points = r.reasons.map((x) => x.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(r.raw).toBeCloseTo(
      points.reduce((a, b) => a + b, 0),
      0,
    );
    expect(r.score).toBe(toScore(r.raw));
  });

  it("is deterministic", () => {
    expect(scoreText(SLOP_COMMENT, LIST)).toEqual(scoreText(SLOP_COMMENT, LIST));
  });

  it("damps very short texts", () => {
    const short = scoreText("Let us delve in.", LIST, { kind: "comment" });
    expect(short.score).toBeLessThan(DEFAULT_THRESHOLD);
    expect(lengthDamping(10, "comment")).toBeLessThan(lengthDamping(50, "comment"));
  });

  it("returns zero for empty input", () => {
    expect(scoreText("", LIST)).toEqual({ score: 0, reasons: [], words: 0, raw: 0 });
  });

  it("lets a platform AI label decide on its own", () => {
    const r = scoreText("Autumn collection, made in Porto.", LIST, {
      kind: "post",
      hints: [{ id: "ai-label", site: "youtube", detail: "Altered or synthetic content" }],
    });
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(r.reasons[0]?.label).toBe("YouTube AI label");
  });

  it("catches chatbot leftovers even in short text", () => {
    const r = scoreText(
      "As an AI language model, I cannot give you legal advice, but here is a summary of the lease.",
      LIST,
      { kind: "comment" },
    );
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("keeps a long human article with a few listed words below the threshold", () => {
    const para =
      "The crucial part of the migration was the schema. We kept the old tables for a month and wrote to both, which was slow but let us compare row counts every night. The landscape of tools here is thin, so most of it was shell scripts. ";
    const r = scoreText(para.repeat(8), LIST, { kind: "article" });
    expect(r.score).toBeLessThan(DEFAULT_THRESHOLD);
  });
});

describe("site helpers", () => {
  it("detects chatbot utm tags", () => {
    expect(chatbotLinkTag("https://example.com/a?utm_source=chatgpt.com")).toBe(
      "utm_source=chatgpt.com",
    );
    expect(chatbotLinkTag("https://example.com/a?utm_source=newsletter")).toBeNull();
  });
  it("recognizes platform AI labels and nothing looser", () => {
    expect(isAiLabelText("Altered or synthetic content")).toBe(true);
    expect(isAiLabelText(" AI-generated ")).toBe(true);
    expect(isAiLabelText("Made with AI")).toBe(true);
    expect(isAiLabelText("I think this is AI-generated")).toBe(false);
  });
});
