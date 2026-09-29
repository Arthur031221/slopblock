import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  isAuthorAllowed,
  isDomainAllowed,
  MAX_THRESHOLD,
  mergeSettings,
  normalizeDomain,
} from "../../src/shared/settings.ts";
import { addHidden, dayKey, readStats } from "../../src/shared/stats.ts";

describe("mergeSettings", () => {
  it("returns defaults for empty or broken storage", () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("junk")).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ threshold: "high", sites: 3 })).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and clamps the threshold", () => {
    const s = mergeSettings({
      enabled: false,
      threshold: 400,
      sites: { x: false },
      allowDomains: ["https://www.Example.com/path"],
    });
    expect(s.enabled).toBe(false);
    expect(s.threshold).toBe(MAX_THRESHOLD);
    expect(s.sites.x).toBe(false);
    expect(s.sites.reddit).toBe(true);
    expect(s.allowDomains).toEqual(["example.com"]);
  });

  it("drops a custom list without entries", () => {
    expect(mergeSettings({ customList: { entries: "nope" } }).customList).toBeNull();
  });
});

describe("allowlists", () => {
  it("matches domains and subdomains only", () => {
    expect(normalizeDomain("HTTPS://www.news.ycombinator.com:443/x")).toBe("news.ycombinator.com");
    expect(isDomainAllowed("old.reddit.com", ["reddit.com"])).toBe(true);
    expect(isDomainAllowed("notreddit.com", ["reddit.com"])).toBe(false);
  });

  it("matches authors case-insensitively across @ and u/ prefixes", () => {
    expect(isAuthorAllowed("@Kernel_Kate", ["kernel_kate"])).toBe(true);
    expect(isAuthorAllowed("spez", ["u/Spez"])).toBe(true);
    expect(isAuthorAllowed(undefined, ["x"])).toBe(false);
  });
});

describe("stats", () => {
  it("adds to today and total and rolls over at midnight", () => {
    let s = readStats(undefined, "2026-09-30");
    s = addHidden(s, 3, "reddit", "2026-09-30");
    s = addHidden(s, 2, "x", "2026-09-30");
    expect(s).toMatchObject({ today: 5, total: 5, bySite: { reddit: 3, x: 2 } });
    s = addHidden(s, 1, "x", "2026-10-01");
    expect(s).toMatchObject({ day: "2026-10-01", today: 1, total: 6 });
  });

  it("formats the local day", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
