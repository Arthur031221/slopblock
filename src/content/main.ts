import defaultList from "../../lists/vocabulary.json";
import { compileList } from "../engine/lists.ts";
import type { WordList } from "../engine/types.ts";
import { ext } from "../shared/browser.ts";
import { mergeSettings, SETTINGS_KEY, type Settings } from "../shared/settings.ts";
import { adapterFor } from "../sites/index.ts";
import { Scanner } from "./scanner.ts";

const DEFAULT_LIST = defaultList as WordList;

function listFor(settings: Settings) {
  return compileList(settings.customList ?? DEFAULT_LIST);
}

function applyPreview(settings: Settings): void {
  document.documentElement.setAttribute(
    "data-slopblock-preview",
    settings.hoverPreview ? "on" : "off",
  );
}

async function main(): Promise<void> {
  if (window.top !== window) return;
  const adapter = adapterFor(location.hostname);
  const stored = await ext.storage.local.get(SETTINGS_KEY);
  let settings = mergeSettings(stored[SETTINGS_KEY]);
  applyPreview(settings);

  const scanner = new Scanner({
    adapter,
    doc: document,
    settings,
    list: listFor(settings),
    // Article mode walks every paragraph on the page, so it rescans less often.
    debounceMs: adapter.id === "generic" ? 1500 : 300,
    onHidden: (added, pageTotal) => {
      ext.runtime
        .sendMessage({ type: "hidden", site: adapter.id, added, pageTotal })
        .catch(() => undefined);
    },
  });
  scanner.scan();
  scanner.observe();

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    const next = mergeSettings(changes[SETTINGS_KEY].newValue);
    const listChanged = JSON.stringify(next.customList) !== JSON.stringify(settings.customList);
    settings = next;
    applyPreview(settings);
    scanner.update(settings, listChanged ? listFor(settings) : undefined);
  });

  ext.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if ((msg as { type?: string })?.type === "page-state") {
      sendResponse({ ...scanner.state(), hiddenOnPage: scanner.hiddenOnPage });
    }
    return false;
  });
}

main().catch((err) => {
  console.warn("slopblock: content script failed to start", err);
});
