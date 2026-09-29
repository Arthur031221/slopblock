import defaultList from "../../lists/vocabulary.json";
import { compileList, ENTRY_KINDS, normalizeTerm, validateList } from "../engine/lists.ts";
import { scoreText } from "../engine/score.ts";
import type { EntryKind, ListEntry, WordList } from "../engine/types.ts";
import { ext } from "../shared/browser.ts";
import { mergeSettings, normalizeDomain, SETTINGS_KEY, type Settings } from "../shared/settings.ts";

const DEFAULT_LIST = defaultList as WordList;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let list: WordList;
let dirty = false;

function status(id: string, text: string, ok = true): void {
  const el = $(id);
  el.textContent = text;
  el.className = `status ${ok ? "ok" : "err"}`;
}

async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
  await ext.storage.local.set({ [SETTINGS_KEY]: settings });
}

function kindSelect(value: EntryKind, onChange: (k: EntryKind) => void): HTMLSelectElement {
  const select = document.createElement("select");
  for (const k of ENTRY_KINDS) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    opt.selected = k === value;
    select.append(opt);
  }
  select.addEventListener("change", () => onChange(select.value as EntryKind));
  return select;
}

function markDirty(): void {
  dirty = true;
  status("list-status", "Unsaved changes", false);
  runTry();
}

function renderEntries(): void {
  const filter = $<HTMLInputElement>("filter").value.trim().toLowerCase();
  const rows = list.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !filter || entry.term.includes(filter) || entry.kind === filter);
  $("entries").replaceChildren(
    ...rows.map(({ entry, index }) => {
      const tr = document.createElement("tr");
      const term = document.createElement("td");
      term.textContent = entry.term;
      const kind = document.createElement("td");
      kind.append(
        kindSelect(entry.kind, (k) => {
          list.entries[index] = { ...entry, kind: k };
          markDirty();
        }),
      );
      const weight = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0.5";
      input.max = "100";
      input.step = "0.5";
      input.value = String(entry.weight);
      input.addEventListener("change", () => {
        const w = Number(input.value);
        if (w > 0 && w <= 100) {
          list.entries[index] = { ...entry, weight: w };
          markDirty();
        }
      });
      weight.append(input);
      const source = document.createElement("td");
      source.className = "muted";
      source.textContent = entry.source ?? "you";
      const actions = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.term}`);
      remove.addEventListener("click", () => {
        list.entries.splice(index, 1);
        markDirty();
        renderEntries();
      });
      actions.append(remove);
      tr.append(term, kind, weight, source, actions);
      return tr;
    }),
  );
  if (!dirty)
    status(
      "list-status",
      `${list.entries.length} entries${settings.customList ? " (edited)" : " (default)"}`,
    );
}

function renderSources(): void {
  $("sources").replaceChildren(
    ...DEFAULT_LIST.sources.map((s) => {
      const li = document.createElement("li");
      const title = s.url ? document.createElement("a") : document.createElement("span");
      title.textContent = s.title;
      if (s.url && title instanceof HTMLAnchorElement) {
        title.href = s.url;
        title.rel = "noreferrer";
        title.target = "_blank";
      }
      li.append(title);
      const bits = [s.author, s.date, s.license].filter(Boolean).join(", ");
      if (bits) li.append(document.createTextNode(` (${bits})`));
      if (s.note) {
        const note = document.createElement("div");
        note.className = "muted";
        note.textContent = s.note;
        li.append(note);
      }
      return li;
    }),
  );
}

function runTry(): void {
  const text = $<HTMLTextAreaElement>("try-text").value;
  const out = $("try-result");
  if (!text.trim()) {
    out.replaceChildren();
    return;
  }
  const result = scoreText(text, compileList(list), { kind: "post" });
  const head = document.createElement("div");
  const score = document.createElement("span");
  score.className = "score";
  score.textContent = `Score ${result.score}`;
  const verdict = document.createElement("span");
  verdict.className = "muted";
  verdict.textContent =
    result.score >= settings.threshold
      ? `  blurred at your threshold of ${settings.threshold}`
      : `  not blurred at your threshold of ${settings.threshold}`;
  head.append(score, verdict);
  const ul = document.createElement("ul");
  for (const r of result.reasons) {
    const li = document.createElement("li");
    li.textContent = `+${Math.round(r.points)} ${r.label}. ${r.detail ?? ""}`;
    ul.append(li);
  }
  if (result.reasons.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No signals found.";
    ul.append(li);
  }
  out.replaceChildren(head, ul);
}

function download(name: string, data: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init(): Promise<void> {
  const stored = await ext.storage.local.get(SETTINGS_KEY);
  settings = mergeSettings(stored[SETTINGS_KEY]);
  list = structuredClone(settings.customList ?? DEFAULT_LIST);

  $<HTMLTextAreaElement>("allow-authors").value = settings.allowAuthors.join("\n");
  $<HTMLTextAreaElement>("allow-domains").value = settings.allowDomains.join("\n");
  $<HTMLInputElement>("hover-preview").checked = settings.hoverPreview;

  const addKind = $<HTMLSelectElement>("add-kind");
  addKind.replaceChildren(...kindSelect("word", () => undefined).options);

  renderEntries();
  renderSources();

  $("try-text").addEventListener("input", runTry);
  $("filter").addEventListener("input", renderEntries);

  $("save-allow").addEventListener("click", async () => {
    const lines = (id: string) =>
      $<HTMLTextAreaElement>(id)
        .value.split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    await saveSettings({
      allowAuthors: lines("allow-authors"),
      allowDomains: lines("allow-domains").map(normalizeDomain).filter(Boolean),
      hoverPreview: $<HTMLInputElement>("hover-preview").checked,
    });
    $<HTMLTextAreaElement>("allow-domains").value = settings.allowDomains.join("\n");
    status("allow-status", "Saved");
  });

  $("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const term = normalizeTerm($<HTMLInputElement>("add-term").value);
    const weight = Number($<HTMLInputElement>("add-weight").value);
    const kind = $<HTMLSelectElement>("add-kind").value as EntryKind;
    if (!term || !(weight > 0 && weight <= 100)) return;
    const existing = list.entries.findIndex((x) => x.term === term && x.kind === kind);
    const entry: ListEntry = { term, weight, kind };
    if (existing >= 0) list.entries[existing] = entry;
    else list.entries.unshift(entry);
    $<HTMLInputElement>("add-term").value = "";
    markDirty();
    renderEntries();
  });

  $("save-list").addEventListener("click", async () => {
    const checked = validateList(list);
    if (!checked.ok) {
      status("list-status", checked.errors.slice(0, 5).join("\n"), false);
      return;
    }
    list = { ...checked.list, sources: list.sources, name: list.name ?? "my list" };
    await saveSettings({ customList: list });
    dirty = false;
    status("list-status", `Saved ${list.entries.length} entries`);
  });

  $("export").addEventListener("click", () => {
    download("slopblock-list.json", `${JSON.stringify(list, null, 2)}\n`);
  });

  $<HTMLInputElement>("import").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const checked = validateList(JSON.parse(await file.text()));
      if (!checked.ok) {
        status("list-status", `Import failed:\n${checked.errors.slice(0, 5).join("\n")}`, false);
        return;
      }
      list = checked.list;
      markDirty();
      renderEntries();
      status(
        "list-status",
        `Imported ${list.entries.length} entries. Review, then Save list.`,
        false,
      );
    } catch (err) {
      status("list-status", `Import failed: not valid JSON (${String(err)})`, false);
    }
  });

  $("reset").addEventListener("click", async () => {
    if (!confirm("Replace your list with the default list? Export first if you want to keep it."))
      return;
    list = structuredClone(DEFAULT_LIST);
    await saveSettings({ customList: null });
    dirty = false;
    renderEntries();
    runTry();
  });
}

init().catch((err) => {
  document.body.textContent = `slopblock could not load its settings: ${String(err)}`;
});
