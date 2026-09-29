import { ext } from "../shared/browser.ts";
import { mergeSettings, SETTINGS_KEY, type SiteId } from "../shared/settings.ts";
import { addHidden, readStats, STATS_KEY } from "../shared/stats.ts";

// Stats writes are read-modify-write, so run them one at a time.
let queue: Promise<unknown> = Promise.resolve();
function enqueue(task: () => Promise<unknown>): void {
  queue = queue.then(task, task);
}

async function refreshGlobalBadge(): Promise<void> {
  const stored = await ext.storage.local.get(SETTINGS_KEY);
  const settings = mergeSettings(stored[SETTINGS_KEY]);
  await ext.action.setBadgeBackgroundColor({ color: settings.enabled ? "#4f46e5" : "#71717a" });
  await ext.action.setBadgeText({ text: settings.enabled ? "" : "off" });
}

interface HiddenMessage {
  type: "hidden";
  site: SiteId;
  added: number;
  pageTotal: number;
}

ext.runtime.onMessage.addListener((msg: unknown, sender) => {
  const m = msg as HiddenMessage;
  if (m?.type !== "hidden" || typeof m.added !== "number") return false;
  enqueue(async () => {
    const stored = await ext.storage.local.get(STATS_KEY);
    await ext.storage.local.set({
      [STATS_KEY]: addHidden(readStats(stored[STATS_KEY]), m.added, m.site),
    });
  });
  const tabId = sender.tab?.id;
  if (tabId !== undefined) {
    ext.action.setBadgeText({ tabId, text: String(m.pageTotal) }).catch(() => undefined);
  }
  return false;
});

ext.commands.onCommand.addListener((command) => {
  if (command !== "toggle-slopblock") return;
  enqueue(async () => {
    const stored = await ext.storage.local.get(SETTINGS_KEY);
    const settings = mergeSettings(stored[SETTINGS_KEY]);
    await ext.storage.local.set({ [SETTINGS_KEY]: { ...settings, enabled: !settings.enabled } });
  });
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) refreshGlobalBadge().catch(() => undefined);
});

ext.runtime.onInstalled.addListener(() => {
  refreshGlobalBadge().catch(() => undefined);
});
ext.runtime.onStartup?.addListener(() => {
  refreshGlobalBadge().catch(() => undefined);
});
