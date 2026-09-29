import { describe, expect, it, vi } from "vitest";
import { BLUR_ATTR, STATE_ATTR, STRIP_TAG } from "../../src/content/blur.ts";
import { Scanner } from "../../src/content/scanner.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/shared/settings.ts";
import { hackernews, reddit } from "../../src/sites/index.ts";
import { LIST, loadFixture, SLOP_COMMENT } from "../helpers.ts";

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...structuredClone(DEFAULT_SETTINGS), ...patch };
}

function redditScanner(patch: Partial<Settings> = {}, onHidden?: (a: number, t: number) => void) {
  const doc = loadFixture("reddit-new.html", "https://www.reddit.com/r/selfhosted/");
  const scanner = new Scanner({
    adapter: reddit,
    doc,
    settings: settings(patch),
    list: LIST,
    onHidden,
    debounceMs: 5,
  });
  return { doc, scanner };
}

describe("Scanner", () => {
  it("blurs the slop items, adds a strip with score and top three reasons", () => {
    const onHidden = vi.fn();
    const { doc, scanner } = redditScanner({}, onHidden);
    expect(scanner.scan()).toBe(2);
    expect(onHidden).toHaveBeenCalledWith(2, 2);
    const blurredPosts = doc.querySelectorAll(`[${STATE_ATTR}="blurred"]`);
    expect(blurredPosts).toHaveLength(2);
    const strip = doc.querySelector(STRIP_TAG);
    expect(strip?.getAttribute("slot")).toBe("text-body");
    const chips = strip?.shadowRoot?.querySelectorAll(".chip") ?? [];
    expect(chips).toHaveLength(3);
    expect(strip?.shadowRoot?.querySelector(".score")?.textContent).toMatch(/^AI \d+$/);
    expect(doc.querySelectorAll(`[${BLUR_ATTR}="on"]`).length).toBeGreaterThanOrEqual(3);
    expect(scanner.state()).toMatchObject({ site: "reddit", active: true, scanned: 4, hidden: 2 });
  });

  it("does not rescore or recount unchanged items", () => {
    const onHidden = vi.fn();
    const { doc, scanner } = redditScanner({}, onHidden);
    scanner.scan();
    expect(scanner.scan()).toBe(0);
    expect(doc.querySelectorAll(STRIP_TAG)).toHaveLength(2);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it("reveals on click of the blurred text and on the button, and hides again", () => {
    const { doc, scanner } = redditScanner();
    scanner.scan();
    const post = doc.querySelectorAll("shreddit-post")[1] as Element;
    const body = post.querySelector('[slot="text-body"]:not(slopblock-strip)') as HTMLElement;
    body.click();
    expect(post.getAttribute(STATE_ATTR)).toBe("revealed");
    expect(body.getAttribute(BLUR_ATTR)).toBe("off");
    const button = post
      .querySelector(STRIP_TAG)
      ?.shadowRoot?.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Hide");
    button.click();
    expect(post.getAttribute(STATE_ATTR)).toBe("blurred");
    expect(button.textContent).toBe("Show");
    expect(scanner.state().hidden).toBe(2);
  });

  it("stops a click on blurred text from reaching the page", () => {
    const { doc, scanner } = redditScanner();
    scanner.scan();
    const post = doc.querySelectorAll("shreddit-post")[1] as Element;
    const pageHandler = vi.fn();
    post.addEventListener("click", pageHandler);
    (post.querySelector('[slot="text-body"]:not(slopblock-strip)') as HTMLElement).click();
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it("skips allowlisted authors", () => {
    const { doc, scanner } = redditScanner({ allowAuthors: ["u/Useful_Pilot_4821"] });
    expect(scanner.scan()).toBe(1);
    expect(doc.querySelectorAll("shreddit-post")[1]?.hasAttribute(STATE_ATTR)).toBe(false);
  });

  it("does nothing when disabled, when the site is off or the domain is paused", () => {
    for (const patch of [
      { enabled: false },
      { sites: { ...DEFAULT_SETTINGS.sites, reddit: false } },
      { allowDomains: ["reddit.com"] },
    ]) {
      const { doc, scanner } = redditScanner(patch);
      expect(scanner.scan()).toBe(0);
      expect(doc.querySelector(STRIP_TAG)).toBeNull();
      expect(scanner.state().active).toBe(false);
    }
  });

  it("removes every trace on update when turned off", () => {
    const { doc, scanner } = redditScanner();
    scanner.scan();
    scanner.update(settings({ enabled: false }));
    expect(doc.querySelector(STRIP_TAG)).toBeNull();
    expect(doc.querySelector(`[${BLUR_ATTR}]`)).toBeNull();
    expect(doc.querySelector(`[${STATE_ATTR}]`)).toBeNull();
  });

  it("follows the threshold", () => {
    const { scanner } = redditScanner({ threshold: 95 });
    expect(scanner.scan()).toBe(0);
    scanner.update(settings({ threshold: 10 }));
    expect(scanner.state().hidden).toBeGreaterThanOrEqual(2);
  });

  it("picks up comments added later through the MutationObserver", async () => {
    const doc = loadFixture("hn-item.html", "https://news.ycombinator.com/item?id=49891290");
    const scanner = new Scanner({
      adapter: hackernews,
      doc,
      settings: settings(),
      list: LIST,
      debounceMs: 5,
    });
    scanner.scan();
    const before = scanner.state().hidden;
    scanner.observe();
    const table = doc.querySelector("table.comment-tree tbody") as Element;
    const row = doc.createElement("tr");
    row.className = "athing comtr";
    row.innerHTML = `<td><span class="comhead"><a class="hnuser">planted</a></span><div class="comment"><div class="commtext c00"></div></div></td>`;
    (row.querySelector(".commtext") as Element).textContent = SLOP_COMMENT;
    table.append(row);
    await vi.waitFor(() => expect(scanner.state().hidden).toBe(before + 1), { timeout: 2000 });
    expect(row.querySelector(STRIP_TAG)).not.toBeNull();
    scanner.disconnect();
  });

  it("leaves the real HN comment page mostly alone", () => {
    const doc = loadFixture("hn-item.html", "https://news.ycombinator.com/item?id=49891290");
    const scanner = new Scanner({ adapter: hackernews, doc, settings: settings(), list: LIST });
    scanner.scan();
    const { scanned, hidden } = scanner.state();
    expect(scanned).toBe(70);
    expect(hidden).toBeLessThanOrEqual(2);
  });
});
