import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP, manifest } from "../scripts/manifest.mjs";
import { ROOT } from "./helpers.ts";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

const NETWORK = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /sendBeacon/,
  /importScripts/,
  /\bimport\s*\(\s*["'`]https?:/,
  /new\s+Worker\s*\(\s*["'`]https?:/,
];

describe("privacy", () => {
  it("has no network APIs anywhere in the extension source", () => {
    const offenders: string[] = [];
    for (const file of files(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const re of NETWORK) if (re.test(text)) offenders.push(`${file}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });

  it("does not load remote scripts or styles in extension pages", () => {
    for (const page of ["src/popup/popup.html", "src/options/options.html"]) {
      const html = readFileSync(join(ROOT, page), "utf8");
      expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/i);
      expect(html).not.toMatch(/<script>(?!<\/script>)/i);
    }
  });
});

describe("manifest", () => {
  for (const target of ["chrome", "firefox"]) {
    it(`${target}: MV3, minimal permissions, strict CSP, no remote hosts`, () => {
      const m = manifest(target, "0.1.0");
      expect(m.manifest_version).toBe(3);
      expect(m.permissions).toEqual(["storage", "activeTab"]);
      expect(m).not.toHaveProperty("host_permissions");
      expect(m.content_security_policy.extension_pages).toBe(CSP);
      expect(CSP).toContain("connect-src 'none'");
      expect(CSP).toContain("script-src 'self'");
      expect(m.commands["toggle-slopblock"].suggested_key.default).toBe("Alt+Shift+S");
    });
  }

  it("uses a service worker on Chrome and event page scripts plus a gecko id on Firefox", () => {
    expect(manifest("chrome", "1.0.0").background).toEqual({ service_worker: "background.js" });
    const ff = manifest("firefox", "1.0.0");
    expect(ff.background).toEqual({ scripts: ["background.js"] });
    expect(ff.browser_specific_settings.gecko.id).toMatch(/@/);
    expect(ff.browser_specific_settings.gecko.data_collection_permissions).toEqual({
      required: ["none"],
    });
  });

  it("rejects unknown targets", () => {
    expect(() => manifest("safari", "1.0.0")).toThrow(/unknown target/);
  });
});
