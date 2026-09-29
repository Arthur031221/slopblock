// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scoreText } from "../../src/engine/score.ts";
import { extractText } from "../../src/sites/dom.ts";
import { findMainText } from "../../src/sites/generic.ts";
import {
  adapterFor,
  generic,
  hackernews,
  linkedin,
  reddit,
  x,
  youtube,
} from "../../src/sites/index.ts";
import { LIST, loadFixture } from "../helpers.ts";

const score = (text: string, kind: Parameters<typeof scoreText>[2] = {}) =>
  scoreText(text, LIST, kind).score;

describe("adapterFor", () => {
  it("picks adapters by hostname and falls back to article mode", () => {
    expect(adapterFor("news.ycombinator.com").id).toBe("hackernews");
    expect(adapterFor("x.com").id).toBe("x");
    expect(adapterFor("mobile.twitter.com").id).toBe("x");
    expect(adapterFor("www.linkedin.com").id).toBe("linkedin");
    expect(adapterFor("old.reddit.com").id).toBe("reddit");
    expect(adapterFor("www.youtube.com").id).toBe("youtube");
    expect(adapterFor("example.org").id).toBe("generic");
    expect(adapterFor("notreddit.com").id).toBe("generic");
  });
});

describe("Hacker News (saved pages)", () => {
  it("finds all 30 front page titles", () => {
    const doc = loadFixture("hn-front.html", "https://news.ycombinator.com/news");
    const items = hackernews.find(doc);
    expect(items).toHaveLength(30);
    expect(items.every((i) => i.kind === "title" && i.text.length > 0)).toBe(true);
    expect(items[0]?.text).toBe("How Delhi cut electricity loss from 50 to 5 percent");
    // Real human titles should not trip the title signals.
    const blurred = items.filter((i) => score(i.text, { kind: "title" }) >= 50);
    expect(blurred).toHaveLength(0);
  });

  it("finds every comment with its author and paragraph breaks", () => {
    const doc = loadFixture("hn-item.html", "https://news.ycombinator.com/item?id=49891290");
    const comments = hackernews.find(doc).filter((i) => i.kind === "comment");
    expect(comments).toHaveLength(69);
    const nico = comments.find((c) => c.author === "nico");
    expect(nico?.text.startsWith("For email you can use a classifier\n\nOne way:")).toBe(true);
    expect(nico?.blur[0]?.classList.contains("commtext")).toBe(true);
  });
});

describe("X (constructed)", () => {
  const doc = loadFixture("x-timeline.html", "https://x.com/home");
  const items = x.find(doc);

  it("finds tweets, skips quoted tweet text, reads handles and emoji images", () => {
    expect(items.map((i) => i.author)).toEqual(["kernel_kate", "growthwithmax", "dan_ops"]);
    expect(items[1]?.text).toContain("\u{1F680}");
    expect(items[2]?.text).toBe("quoting this because it is so good");
    expect(items[1]?.blur).toHaveLength(2);
  });

  it("scores the growth thread high and the bug story low", () => {
    expect(score(items[1]?.text ?? "")).toBeGreaterThanOrEqual(50);
    expect(score(items[0]?.text ?? "")).toBeLessThan(20);
  });
});

describe("LinkedIn (constructed)", () => {
  const doc = loadFixture("linkedin-feed.html", "https://www.linkedin.com/feed/");
  const items = linkedin.find(doc);

  it("finds posts and comments with authors", () => {
    expect(items.map((i) => [i.kind, i.author])).toEqual([
      ["post", "Priya Raman"],
      ["post", "Jordan Blake"],
      ["post", "Studio Fern"],
      ["comment", "Sam Ortiz"],
    ]);
  });

  it("reads the AI-generated marker and Content Credentials", () => {
    const hints = items[2]?.hints?.map((h) => h.id);
    expect(hints).toContain("ai-label");
    expect(hints).toContain("content-credentials");
    expect(items[0]?.hints).toEqual([]);
  });

  it("separates the template post from the engineering post", () => {
    expect(score(items[1]?.text ?? "")).toBeGreaterThanOrEqual(50);
    expect(score(items[0]?.text ?? "")).toBeLessThan(20);
    expect(score(items[2]?.text ?? "", { hints: items[2]?.hints })).toBeGreaterThanOrEqual(50);
  });
});

describe("Reddit (constructed)", () => {
  it("reads shreddit posts and comments without mixing nested replies", () => {
    const doc = loadFixture("reddit-new.html", "https://www.reddit.com/r/selfhosted/");
    const items = reddit.find(doc);
    expect(items.map((i) => [i.kind, i.author])).toEqual([
      ["post", "tinfoil_toaster"],
      ["post", "Useful_Pilot_4821"],
      ["comment", "nas_or_nothing"],
      ["comment", "HelpfulGuide_2024"],
    ]);
    expect(items[2]?.text).not.toContain("Great question");
    expect(items[1]?.text).toContain("# Key Benefits");
    expect(items[1]?.text).toContain("- **Privacy:**");
    expect(score(items[1]?.text ?? "")).toBeGreaterThanOrEqual(50);
    expect(score(items[3]?.text ?? "", { kind: "comment" })).toBeGreaterThanOrEqual(50);
    expect(score(items[0]?.text ?? "")).toBeLessThan(20);
    expect(score(items[2]?.text ?? "", { kind: "comment" })).toBeLessThan(20);
  });

  it("reads old reddit things", () => {
    const doc = loadFixture("reddit-old.html", "https://old.reddit.com/r/Coffee/comments/ghi789/");
    const items = reddit.find(doc);
    expect(items.map((i) => [i.kind, i.author])).toEqual([
      ["post", "coffee_nerd_88"],
      ["comment", "espresso_elder"],
      ["comment", "BrewMaster_AI_Tips"],
    ]);
    expect(items[1]?.text).not.toContain("game-changer");
    expect(score(items[2]?.text ?? "", { kind: "comment" })).toBeGreaterThanOrEqual(50);
    expect(score(items[1]?.text ?? "", { kind: "comment" })).toBeLessThan(20);
  });
});

describe("YouTube (constructed)", () => {
  const doc = loadFixture("youtube.html", "https://www.youtube.com/");
  const items = youtube.find(doc);

  it("finds feed cards, the watch description and comments", () => {
    expect(items.map((i) => i.kind)).toEqual(["title", "title", "post", "comment", "comment"]);
    expect(items[0]?.author).toBe("Shop Floor Notes");
    expect(items[3]?.author).toBe("@latin_teacher");
  });

  it("turns the synthetic content label into a hint on cards and the watch page", () => {
    expect(items[0]?.hints).toEqual([]);
    expect(items[1]?.hints?.[0]).toMatchObject({
      id: "ai-label",
      detail: "Altered or synthetic content",
    });
    expect(items[2]?.hints?.[0]?.id).toBe("ai-label");
  });

  it("blurs the thumbnail with the title", () => {
    expect(items[1]?.blur.some((e) => e.tagName.toLowerCase() === "ytd-thumbnail")).toBe(true);
  });

  it("scores the gushing comment well above the specific one", () => {
    const gushing = score(items[4]?.text ?? "", { kind: "comment" });
    const specific = score(items[3]?.text ?? "", { kind: "comment" });
    expect(gushing - specific).toBeGreaterThanOrEqual(20);
    expect(specific).toBeLessThan(10);
  });
});

describe("generic article mode", () => {
  it("finds the main text of a real blog post and leaves it alone", () => {
    const doc = loadFixture("article-human.html", "https://danluu.com/cocktail-ideas/");
    const items = generic.find(doc);
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("article");
    expect((items[0]?.text.length ?? 0) > 2000).toBe(true);
    expect(score(items[0]?.text ?? "", { kind: "article" })).toBeLessThan(35);
  });

  it("finds and flags a content-farm article", () => {
    const doc = loadFixture("article-machine.html", "https://techtrendz.example/blog/remote");
    const main = findMainText(doc);
    expect(main?.tagName.toLowerCase()).toBe("article");
    const items = generic.find(doc);
    expect(score(items[0]?.text ?? "", { kind: "article" })).toBeGreaterThanOrEqual(50);
  });

  it("returns nothing on pages without an article", () => {
    const doc = loadFixture("x-timeline.html", "https://example.org/");
    expect(generic.find(doc)).toEqual([]);
  });
});

describe("extractText", () => {
  it("keeps paragraphs, list markers, headings and bold", () => {
    const doc = loadFixture("reddit-new.html", "https://www.reddit.com/");
    const body = doc.querySelectorAll('[slot="text-body"]')[1];
    const text = body ? extractText(body) : "";
    expect(text).toMatch(/necessity\. Self-hosting/);
    expect(text).toMatch(/\n\n# Key Benefits\n/);
    expect(text).toMatch(/\n- \*\*Privacy:\*\* Your data stays yours\./);
  });
});
