import type { ScoreResult } from "../engine/types.ts";
import type { FoundItem } from "../sites/types.ts";

export const STATE_ATTR = "data-slopblock";
export const BLUR_ATTR = "data-slopblock-blur";
export const STRIP_TAG = "slopblock-strip";

const STRIP_CSS = `
:host { all: initial; display: block; }
.bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  font: 500 11.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #3f3f46; margin: 0; padding: 0;
}
.score {
  font-weight: 700; padding: 1px 7px; border-radius: 999px;
  background: #4f46e5; color: #fff; letter-spacing: 0.02em;
}
.chip {
  padding: 1px 7px; border-radius: 999px; background: #eef0f4; color: #3f3f46;
  border: 1px solid #dcdfe6; max-width: 22em; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
button {
  font: inherit; cursor: pointer; padding: 1px 9px; border-radius: 999px;
  border: 1px solid #c7cad3; background: #fff; color: #27272a;
}
button:hover { background: #f4f4f5; }
button:focus-visible { outline: 2px solid #4f46e5; outline-offset: 1px; }
.revealed .chip { display: none; }
.revealed .score { background: #a1a1aa; }
@media (prefers-color-scheme: dark) {
  .bar { color: #d4d4d8; }
  .chip { background: #27272a; color: #d4d4d8; border-color: #3f3f46; }
  button { background: #18181b; color: #e4e4e7; border-color: #52525b; }
  button:hover { background: #27272a; }
}
`;

function describe(result: ScoreResult): string {
  const lines = result.reasons.map((r) => `+${Math.round(r.points)}  ${r.detail ?? r.label}`);
  return `slopblock score ${result.score} of 100\n${lines.join("\n")}\nClick the blurred text or Show to read it.`;
}

/** The blur and reason strip on one item. */
export class Blur {
  readonly strip: HTMLElement;
  private revealed = false;
  private readonly onClick = (e: Event): void => {
    if (this.revealed) return;
    e.preventDefault();
    e.stopPropagation();
    this.reveal();
  };

  readonly item: FoundItem;
  readonly result: ScoreResult;

  constructor(item: FoundItem, result: ScoreResult) {
    this.item = item;
    this.result = result;
    const doc = item.el.ownerDocument;
    this.strip = doc.createElement(STRIP_TAG);
    const slot = item.before?.getAttribute("slot");
    if (slot) this.strip.setAttribute("slot", slot);
    this.strip.setAttribute("role", "note");
    this.strip.setAttribute(
      "aria-label",
      `slopblock: likely machine-written, score ${result.score}. ${result.reasons
        .slice(0, 3)
        .map((r) => r.label)
        .join(", ")}`,
    );
    const root = this.strip.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = STRIP_CSS;
    root.append(style, this.render(doc));
    let ref: Element | null | undefined = item.before;
    while (ref && ref.parentElement !== item.mount) ref = ref.parentElement;
    item.mount.insertBefore(this.strip, ref ?? null);
    for (const el of item.blur) {
      el.addEventListener("click", this.onClick, true);
    }
    this.hide();
  }

  private render(doc: Document): HTMLElement {
    const bar = doc.createElement("div");
    bar.className = "bar";
    bar.title = describe(this.result);
    const score = doc.createElement("span");
    score.className = "score";
    score.textContent = `AI ${this.result.score}`;
    bar.append(score);
    for (const r of this.result.reasons.slice(0, 3)) {
      const chip = doc.createElement("span");
      chip.className = "chip";
      chip.textContent = r.label;
      chip.title = r.detail ?? r.label;
      bar.append(chip);
    }
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "toggle";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.revealed) this.hide();
      else this.reveal();
    });
    bar.append(button);
    return bar;
  }

  private sync(): void {
    const bar = this.strip.shadowRoot?.querySelector(".bar");
    const button = this.strip.shadowRoot?.querySelector("button");
    bar?.classList.toggle("revealed", this.revealed);
    if (button) {
      button.textContent = this.revealed ? "Hide" : "Show";
      button.setAttribute("aria-pressed", String(this.revealed));
    }
    this.item.el.setAttribute(STATE_ATTR, this.revealed ? "revealed" : "blurred");
    for (const el of this.item.blur) el.setAttribute(BLUR_ATTR, this.revealed ? "off" : "on");
  }

  get isRevealed(): boolean {
    return this.revealed;
  }

  reveal(): void {
    this.revealed = true;
    this.sync();
  }

  hide(): void {
    this.revealed = false;
    this.sync();
  }

  /** Undo everything this blur changed on the page. */
  remove(): void {
    this.strip.remove();
    this.item.el.removeAttribute(STATE_ATTR);
    for (const el of this.item.blur) {
      el.removeAttribute(BLUR_ATTR);
      el.removeEventListener("click", this.onClick, true);
    }
  }
}
