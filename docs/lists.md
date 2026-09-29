# Editing the word and phrase list

slopblock scores text with a list of weighted terms plus a set of structural checks. The list is yours: edit it on the options page (right-click the toolbar icon, Options), or export it, edit the JSON and import it again. Your list is stored in the browser with `chrome.storage.local` and never leaves it.

## Format

```json
{
  "version": 1,
  "name": "my list",
  "sources": [{ "id": "me", "title": "My additions" }],
  "entries": [
    { "term": "delv*", "weight": 10, "kind": "word", "source": "me" },
    { "term": "it's worth noting", "weight": 8, "kind": "phrase" },
    { "term": "great question", "weight": 10, "kind": "opener" },
    { "term": "hope this helps", "weight": 4, "kind": "signoff" }
  ]
}
```

A bare array of entries also imports. `kind` defaults to `word`, `source` is optional. Terms are case-insensitive and curly quotes count as straight ones.

## Kinds

| Kind | Where it counts | How it scores |
|---|---|---|
| `word` | anywhere | weight per distinct term, a little more for repeats, scaled down for texts over 200 words |
| `phrase` | anywhere | same as word. Phrases with weight 40 or more are chatbot leftovers ("as an AI language model") and count in full on any length |
| `opener` | the first few characters | the highest matching weight |
| `signoff` | the last paragraph, or the last sentence or two | sum of weights, capped at 30 |
| `hedge` | anywhere | only when two or more hedges appear, capped at 14 |
| `template` | anywhere | only when two or more distinct template markers appear, capped at 28 |

## Wildcards

- A trailing `*` matches any ending: `delv*` matches delve, delves, delved and delving. Watch for collisions: `elevat*` would also match elevator, which is why the default list spells out `elevate`, `elevates` and `elevating`.
- A lone `*` inside a phrase matches one word: `plays a * role` matches "plays a key role".

## Weights

Points add up into a raw score, which maps to 0 to 100 as `100 * (1 - exp(-raw / 55))`. Rough guide:

| Raw points | Score |
|---|---|
| 10 | 17 |
| 25 | 37 |
| 38 | 50 |
| 55 | 63 |
| 90 | 81 |

Texts under 50 words are damped: their text points are multiplied by `(words + 10) / 60`. Platform labels and chatbot leftovers are not damped.

Use the "Try it" box on the options page to see the effect of an edit before you save.

## Where the default list comes from

- **The load-bearing vocabulary of Claude** by Louis Abraham (MIT, 2026-08-27, [page](https://louisabraham.github.io/load-bearing/), [HN discussion](https://news.ycombinator.com/item?id=49461817)). A study of 461k GitHub pull request descriptions that found one cluster of vocabulary going from 0.7 percent to 39 percent of the corpus. slopblock takes words with the highest lift in that cluster (from the published `analysis.js`, generated 2026-09-29) and keeps only those that are rare in casual human prose, such as `load-bearing`, `plainly`, `vacuously` and `byte-identical`. Common words from the cluster (nobody, says, told) are left out because they would misfire.
- **Wikipedia: Signs of AI writing** by WikiProject AI Cleanup (CC BY-SA 4.0, read 2026-09-30, [page](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)). The AI vocabulary words by model era, puffery words, collaborative-communication phrases and knowledge-cutoff disclaimers. That page cites the underlying studies, including Kobak et al. (Science Advances 2025) and Juzek and Ward (Findings of ACL 2025).
- **slopblock additions**: marketing and LinkedIn engagement phrases, openers and sign-offs collected by hand, with weights set on the dev half of the benchmark.

Each entry in `lists/vocabulary.json` names its source.
