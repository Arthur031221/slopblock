// Captures the README screenshots and GIF: demo/feed.html served at a linkedin.com URL in a
// Chromium with the built extension loaded. Every request is answered locally, nothing goes
// out. Needs `npm run build` first and a Playwright Chromium (`npx playwright-core install
// chromium`). ffmpeg is optional and only used for the GIF.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "..");
const EXT = join(ROOT, "dist/chrome");
const OUT = join(ROOT, "demo");
const FEED = readFileSync(join(OUT, "feed.html"), "utf8");

if (!existsSync(join(EXT, "manifest.json"))) {
  console.error("dist/chrome is missing. Run npm run build first.");
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), "slopblock-demo-"));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    // The full Chromium in new headless mode. The default headless shell cannot load extensions.
    channel: "chromium",
    headless: true,
    viewport: { width: 760, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
    ],
  });
} catch (err) {
  console.error(
    `Could not start Chromium: ${err.message}\nInstall it with: npx playwright-core install chromium`,
  );
  process.exit(1);
}

await context.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith("chrome-extension://")) return route.continue();
  if (url.startsWith("https://www.linkedin.com/feed")) {
    return route.fulfill({ status: 200, contentType: "text/html", body: FEED });
  }
  return route.fulfill({ status: 404, body: "" });
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent("serviceworker");
const extensionId = new URL(worker.url()).host;

const setSettings = (patch) =>
  worker.evaluate(async (p) => {
    const cur = (await chrome.storage.local.get("settings")).settings ?? {};
    await chrome.storage.local.set({ settings: { ...cur, ...p } });
  }, patch);

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" || m.text().startsWith("slopblock")) errors.push(`console: ${m.text()}`);
});
const frames = [];
const shot = async (name, hold) => {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  frames.push({ path, hold });
  console.log(`wrote demo/${name}.png`);
};

await setSettings({ enabled: false });
await page.goto("https://www.linkedin.com/feed/");
await page.waitForTimeout(600);
await shot("before", 2.5);

await setSettings({ enabled: true });
await page.waitForSelector("slopblock-strip");
await page.waitForTimeout(400);
await shot("after", 3.5);

const blurredText = page.locator("[data-slopblock-blur='on']").first();
await blurredText.hover();
await page.waitForTimeout(900);
await shot("hover", 2);

await page.mouse.move(5, 5);
await page.locator("slopblock-strip").first().locator("button").click();
await page.waitForTimeout(400);
await shot("revealed", 2.5);

const popup = await context.newPage();
await popup.setViewportSize({ width: 300, height: 520 });
await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
await popup.waitForTimeout(500);
await popup.screenshot({ path: join(OUT, "popup.png") });
console.log("wrote demo/popup.png");

const options = await context.newPage();
await options.setViewportSize({ width: 900, height: 900 });
await options.goto(`chrome-extension://${extensionId}/options/options.html`);
await options.fill(
  "#try-text",
  "Great question! When it comes to password managers, it's important to note that security isn't just about encryption — it's about habits.\n\nUltimately, the best one is the one you use. Hope this helps!",
);
await options.waitForTimeout(300);
await options.screenshot({ path: join(OUT, "options.png") });
console.log("wrote demo/options.png");

if (errors.length > 0) console.warn(`errors while capturing:\n${errors.join("\n")}`);
else console.log("no page or extension errors");

await context.close();
rmSync(profile, { recursive: true, force: true });

// GIF from the four feed frames, if ffmpeg is installed.
if (spawnSync("ffmpeg", ["-version"]).status === 0) {
  const inputs = frames.flatMap((f) => ["-loop", "1", "-t", String(f.hold), "-i", f.path]);
  const concat = `${frames.map((_, i) => `[${i}:v]`).join("")}concat=n=${frames.length}:v=1:a=0,fps=10,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    concat,
    join(OUT, "demo.gif"),
  ]);
  console.log("wrote demo/demo.gif");
} else {
  console.log("ffmpeg not found, skipped demo/demo.gif");
}
