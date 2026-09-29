# Changelog

## 0.1.0 (2026-09-30)

First release.

- Scoring engine with an editable word and phrase list (354 entries from three attributed sources) and structural signals: em dash density, "it's not X, it's Y" constructions, rule of three, emoji bullets, Markdown formatting, sentence length uniformity, hedging, sign-offs, hashtag blocks, one-line paragraphs and self-answered questions.
- Site signals: YouTube "Altered or synthetic content" labels, LinkedIn AI-generated markers and Content Credentials, chatbot link tags such as `utm_source=chatgpt.com`, and engagement template posts.
- Site adapters for Hacker News, X, LinkedIn, Reddit (new and old), YouTube, and an article mode for any other page.
- Blur with a reason strip (score and top three reasons), click to reveal, hover to preview.
- Popup with daily and total counters, sensitivity slider, per-site toggles and pause per site. Options page with an editable list, JSON import and export, author and domain allowlists, and a "Try it" box.
- Keyboard shortcut Alt+Shift+S to turn it on or off.
- Chrome and Firefox builds from one code base, zipped by `npm run build`.
- Benchmark in `bench/` with the method, prompts and results, including three small ONNX classifiers for comparison. None is bundled, see the README.
