import { ext } from "../shared/browser.ts";
import {
  isDomainAllowed,
  mergeSettings,
  normalizeDomain,
  SETTINGS_KEY,
  type Settings,
  SITE_IDS,
  SITE_LABELS,
} from "../shared/settings.ts";
import { readStats, STATS_KEY } from "../shared/stats.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let host = "";

async function save(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
  await ext.storage.local.set({ [SETTINGS_KEY]: settings });
  render();
}

function render(): void {
  $<HTMLInputElement>("enabled").checked = settings.enabled;
  $<HTMLInputElement>("threshold").value = String(settings.threshold);
  $<HTMLOutputElement>("threshold-value").textContent = String(settings.threshold);
  const paused = host !== "" && isDomainAllowed(host, settings.allowDomains);
  const pause = $<HTMLButtonElement>("pause-site");
  pause.textContent = paused ? `Resume on ${host}` : "Pause on this site";
  pause.disabled = host === "";
  const box = $<HTMLDivElement>("sites");
  box.replaceChildren(
    ...SITE_IDS.map((id) => {
      const label = document.createElement("label");
      label.className = "site";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = settings.sites[id];
      input.addEventListener("change", () => {
        save({ sites: { ...settings.sites, [id]: input.checked } });
      });
      label.append(input, document.createTextNode(SITE_LABELS[id]));
      return label;
    }),
  );
}

async function loadStats(): Promise<void> {
  const stored = await ext.storage.local.get(STATS_KEY);
  const stats = readStats(stored[STATS_KEY]);
  $("today").textContent = stats.today.toLocaleString("en-US");
  $("total").textContent = stats.total.toLocaleString("en-US");
}

async function loadPageState(): Promise<void> {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return;
  host = normalizeDomain(new URL(tab.url).hostname);
  try {
    const state = (await ext.tabs.sendMessage(tab.id, { type: "page-state" })) as
      | { hidden: number; scanned: number; active: boolean }
      | undefined;
    if (state) {
      $("page").textContent = state.active
        ? `${state.hidden} hidden of ${state.scanned} checked`
        : "paused";
    }
  } catch {
    $("page").textContent = "reload the page to start";
  }
}

async function loadShortcut(): Promise<void> {
  try {
    const commands = await ext.commands.getAll();
    const toggle = commands.find((c) => c.name === "toggle-slopblock");
    if (toggle?.shortcut) $("shortcut").textContent = toggle.shortcut;
  } catch {
    // Keep the default text.
  }
}

async function init(): Promise<void> {
  const stored = await ext.storage.local.get(SETTINGS_KEY);
  settings = mergeSettings(stored[SETTINGS_KEY]);
  await loadPageState();
  render();
  await Promise.all([loadStats(), loadShortcut()]);

  $<HTMLInputElement>("enabled").addEventListener("change", (e) => {
    save({ enabled: (e.target as HTMLInputElement).checked });
  });
  const slider = $<HTMLInputElement>("threshold");
  slider.addEventListener("input", () => {
    $<HTMLOutputElement>("threshold-value").textContent = slider.value;
  });
  slider.addEventListener("change", () => {
    save({ threshold: Number(slider.value) });
  });
  $("pause-site").addEventListener("click", () => {
    if (!host) return;
    const paused = isDomainAllowed(host, settings.allowDomains);
    save({
      allowDomains: paused
        ? settings.allowDomains.filter((d) => !isDomainAllowed(host, [d]))
        : [...settings.allowDomains, host],
    });
  });
  $("open-options").addEventListener("click", () => {
    ext.runtime.openOptionsPage();
    window.close();
  });
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STATS_KEY]) loadStats();
  });
}

init().catch((err) => {
  document.body.textContent = `slopblock could not load its settings: ${String(err)}`;
});
