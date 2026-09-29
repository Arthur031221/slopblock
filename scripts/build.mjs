// Builds dist/chrome and dist/firefox and zips both. Usage: node scripts/build.mjs [--watch]
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import { manifest } from "./manifest.mjs";
import { zipDirectory } from "./zip.mjs";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const TARGETS = { chrome: ["chrome116"], firefox: ["firefox140"] };

const ENTRIES = {
  content: "src/content/main.ts",
  background: "src/background/background.ts",
  "popup/popup": "src/popup/popup.ts",
  "options/options": "src/options/options.ts",
};

const STATIC = {
  "content.css": "src/content/content.css",
  "popup/popup.html": "src/popup/popup.html",
  "popup/popup.css": "src/popup/popup.css",
  "options/options.html": "src/options/options.html",
  "options/options.css": "src/options/options.css",
  "icons/icon-16.png": "static/icons/icon-16.png",
  "icons/icon-32.png": "static/icons/icon-32.png",
  "icons/icon-48.png": "static/icons/icon-48.png",
  "icons/icon-128.png": "static/icons/icon-128.png",
  LICENSE: "LICENSE",
};

async function copyStatic(outdir) {
  for (const [to, from] of Object.entries(STATIC)) {
    const dest = join(outdir, to);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(from, dest);
  }
}

function options(target, outdir) {
  return {
    entryPoints: ENTRIES,
    outdir,
    bundle: true,
    format: "iife",
    target: TARGETS[target],
    // Not minified: store reviewers read the code, and it stays small anyway.
    minify: false,
    legalComments: "none",
    charset: "utf8",
    logLevel: "warning",
  };
}

async function buildTarget(target) {
  const outdir = join("dist", target);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await esbuild.build(options(target, outdir));
  await copyStatic(outdir);
  await writeFile(
    join(outdir, "manifest.json"),
    `${JSON.stringify(manifest(target, pkg.version), null, 2)}\n`,
  );
  const zip = join("dist", `slopblock-${target}-${pkg.version}.zip`);
  const n = await zipDirectory(outdir, zip);
  console.log(`${target}: ${outdir} (${n} files), ${zip}`);
}

if (watch) {
  for (const target of Object.keys(TARGETS)) {
    const outdir = join("dist", target);
    await mkdir(outdir, { recursive: true });
    await copyStatic(outdir);
    await writeFile(join(outdir, "manifest.json"), `${JSON.stringify(manifest(target, pkg.version), null, 2)}\n`);
    const ctx = await esbuild.context(options(target, outdir));
    await ctx.watch();
  }
  console.log("watching src/ for changes, reload the extension after each rebuild");
} else {
  for (const target of Object.keys(TARGETS)) await buildTarget(target);
}
