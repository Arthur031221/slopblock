# Contributing

Thanks for helping. The short version:

```sh
git clone https://github.com/Arthur031221/slopblock
cd slopblock
npm ci
npm test          # vitest, under a minute
npm run lint      # biome and tsc
npm run build     # dist/chrome and dist/firefox
npm run bench     # rescore the benchmark and rewrite bench/results.md
```

Load `dist/chrome` as an unpacked extension (or `dist/firefox/manifest.json` as a temporary add-on) and run `npm run dev` to rebuild on save.

## Rules

- No network calls from the extension, ever. `tests/privacy.test.ts` fails the build if `fetch`, `XMLHttpRequest`, `WebSocket` and friends show up in `src/`.
- The engine in `src/engine/` stays pure: strings in, scores out, no DOM and no extension APIs.
- Every change to weights or signals should come with `npm run bench` output before and after. Tune on the dev half and report the test half. A change that raises the false positive rate on human text needs a strong reason.
- Adapters need a fixture in `tests/fixtures/` and a test in `tests/sites/`. Save the page, strip scripts and personal details, and note the source and date in an HTML comment at the top.
- Keep dependencies to a minimum and pin exact versions.

## Adding a site

1. Write `src/sites/<site>.ts` exporting a `SiteAdapter`: `matches(host)` and `find(root)` returning items with text, author, the elements to blur and where to put the reason strip.
2. Register it in `src/sites/index.ts` and add the id to `SITE_IDS` in `src/shared/settings.ts`.
3. Add a fixture and tests.

## Commit messages

Imperative mood, one line, for example `Add Mastodon adapter`.
