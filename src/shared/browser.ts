/**
 * The extension API object. Firefox exposes a promise based `browser`, Chrome a promise based
 * `chrome` in Manifest V3. The calls used here have the same shape in both.
 */
export const ext: typeof chrome =
  (globalThis as unknown as { browser?: typeof chrome }).browser ?? globalThis.chrome;
