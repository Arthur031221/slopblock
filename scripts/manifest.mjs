// Manifest V3 for Chrome and Firefox. The two differ only in how the background script is
// declared and in Firefox's browser_specific_settings.

// Chat apps where blurring model output makes no sense. Users can add more in the options.
export const EXCLUDED = [
  "*://chatgpt.com/*",
  "*://chat.openai.com/*",
  "*://claude.ai/*",
  "*://gemini.google.com/*",
  "*://copilot.microsoft.com/*",
  "*://*.perplexity.ai/*",
  "*://chat.deepseek.com/*",
  "*://poe.com/*",
  "*://mail.google.com/*",
  "*://docs.google.com/*",
];

export const CSP =
  "script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'";

export function manifest(target, version) {
  const icons = {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  };
  const base = {
    manifest_version: 3,
    name: "slopblock",
    version,
    description:
      "Blurs AI-generated posts and articles in your feeds, fully on-device, and tells you why.",
    icons,
    action: {
      default_title: "slopblock",
      default_popup: "popup/popup.html",
      default_icon: icons,
    },
    options_ui: { page: "options/options.html", open_in_tab: true },
    permissions: ["storage", "activeTab"],
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        exclude_matches: EXCLUDED,
        js: ["content.js"],
        css: ["content.css"],
        run_at: "document_idle",
        all_frames: false,
      },
    ],
    commands: {
      "toggle-slopblock": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Turn slopblock on or off",
      },
    },
    content_security_policy: { extension_pages: CSP },
  };
  if (target === "chrome") {
    return {
      ...base,
      background: { service_worker: "background.js" },
      minimum_chrome_version: "116",
    };
  }
  if (target === "firefox") {
    return {
      ...base,
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: {
          id: "slopblock@arthur031221.github.io",
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["none"] },
        },
      },
    };
  }
  throw new Error(`unknown target: ${target}`);
}
