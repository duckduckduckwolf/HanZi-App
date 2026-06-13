# HanZi — Chinese writing practice

A personal web app for practising handwriting of Chinese characters
(Skritter-style stroke quizzes) with a customisable, Anki-style spaced-repetition
schedule (powered by FSRS). Built to be installed to an iPhone home screen as a
Progressive Web App. All data stays on the device; there is no account or server.

## Features (v1)

- **Writing quiz** — see a word's meaning + pinyin, write each character
  stroke-by-stroke, with hint and reveal options.
- **Add words** — paste simplified Chinese; pinyin and meaning are filled in
  automatically from a bundled CC-CEDICT dictionary (editable before saving).
- **Spaced repetition** — FSRS scheduling decides when each card returns.
  Grades are auto-suggested from your stroke mistakes and can be overridden.
- **Settings** — desired retention, new cards/day, max reviews/day, learning
  steps, maximum interval, new-card order, and grading threshold.
- **Backup** — export/import all data as a JSON file.
- **Offline** — works without a connection once installed; stroke data is cached
  when a word is added.

## Develop

```sh
npm install
npm run dev        # start the dev server
npm test           # run the test suite
npm run build      # production build into dist/
npm run build:dict # regenerate public/cedict.tsv from a CC-CEDICT download in tmp/
```

## Deploy

Pushing to `main`/`master` triggers `.github/workflows/deploy.yml`, which builds
and publishes to GitHub Pages at `https://<username>.github.io/<repo>/`. The base
path is derived from the repository name automatically.

## Attribution

- Dictionary: [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) (CC BY-SA 4.0)
- Stroke data: [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) via
  [hanzi-writer](https://hanziwriter.org/) (data: CC BY-SA / LGPL)
