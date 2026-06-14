# CLAUDE.md — project guide for AI assistants

Read this first when working on the HanZi App. It documents the architecture,
conventions, and workflows so a new session can be productive immediately.

## What this is

A personal Progressive Web App for practising handwriting of **simplified**
Chinese characters (Skritter-style stroke quizzes) with **Anki-style FSRS**
spaced repetition. Installed to an iPhone home screen. **All data is on-device**
(IndexedDB) — no account, no server, no analytics. Built for a single owner
who is new to programming: explain changes in plain language and check in on
product decisions before building them.

Live: https://duckduckduckwolf.github.io/HanZi-App/
Repo: https://github.com/duckduckduckwolf/HanZi-App

## Privacy — this is a PUBLIC repo

The GitHub repo is public. Do **not** put personal information (the owner's real
name, email address, location, etc.) into tracked files, commit messages, or the
commit author field. Commits are authored as `duckduckduckwolf` with a GitHub
no-reply email — keep that identity. If the owner shares personal details in
chat, keep them out of anything that gets committed or pushed.

## Stack

- **Vite + React + TypeScript** (strict). UI is plain React + CSS (no UI framework).
- **hanzi-writer** — stroke-by-stroke writing quiz + grading.
- **ts-fsrs** — the spaced-repetition scheduling algorithm.
- **Dexie** (IndexedDB) — on-device storage; `dexie-react-hooks` for live UI updates.
- **CC-CEDICT** — bundled dictionary for pinyin/meaning lookup.
- **vite-plugin-pwa** — manifest + offline service worker.
- **Vitest** + `fake-indexeddb` — tests (logic, not UI).

## Commands

```sh
npm install          # one-time / after dependency changes
npm run dev          # dev server (also launched via .claude/launch.json preview)
npm test             # run all tests
npm run build        # type-check + production build into dist/
npm run build:dict   # regenerate public/cedict.tsv (needs tmp/cedict.txt.gz — see scripts/build-dict.mjs)
npm run build:kmandarin  # regenerate public/kmandarin.tsv (preferred reading per heteronym; uses pinyin-pro, build-time only)
```

Note (this machine): if `npm`/`node` aren't found in a shell, prepend
`C:\Program Files\nodejs` to PATH — Node was installed mid-session and the PATH
wasn't refreshed. The preview launch config already handles this.

## Project structure

```
src/
  App.tsx                  Tab shell (Today / Add / Words / Settings)
  main.tsx, index.css      Entry + all styles (single stylesheet)
  types.ts                 Word, CharResult
  devClock.ts              now(); dev-only time-travel (window.__timeTravel(days))
  db/
    db.ts                  Dexie schema: cards, reviewLogs, charData, kv
    cards.ts               add/list/update/delete cards (+ dedup)
    backup.ts              export/import full data as JSON
  dict/
    cedict.ts              load + parse public/cedict.tsv (+ kmandarin.tsv);
                           word lookup, default-reading scoring, meaning
                           cleanup, and full word-detail builder
  quiz/
    CharacterQuiz.tsx      hanzi-writer wrapper: one character, grading, pop animation
    charData.ts            stroke data: CDN fetch + IndexedDB cache (offline)
  scheduler/
    settings.ts            Settings type + DEFAULT_SETTINGS + normalize/clamp
    settingsStore.ts       load/save settings in kv table
    fsrs.ts                ts-fsrs wrapper: grade, interval preview, grade suggestion
    queue.ts               buildQueue (daily caps) + gradeCard (writes log, schedules)
  review/
    ReviewSession.tsx      study flow: quiz -> grade bar -> next; re-queues learning cards
    GradeBar.tsx           Again/Hard/Good/Easy with interval previews + suggestion
  screens/
    TodayScreen.tsx        due/new counts + Study button
    AddWordsScreen.tsx     paste -> lookup -> edit (pick reading) -> save
    WordListScreen.tsx     live list, inline edit, delete; tap a row for detail
    WordDetailModal.tsx    bottom-sheet: card info + full cleaned dictionary entry
    SettingsScreen.tsx     FSRS settings + backup export/import
tests/                     Vitest specs (cedict, cards, scheduler, backup)
scripts/build-dict.mjs     one-off: CC-CEDICT download -> public/cedict.tsv
.github/workflows/deploy.yml  build + deploy to GitHub Pages on push to main
```

## Key conventions & design notes

- **Scheduling is pure and testable.** `buildQueue`/`gradeCard`/`applyGrade` take
  an injected `now` (ms). Tests "time-travel" by passing future timestamps. Keep
  new scheduling logic this way; cover it in `tests/scheduler.test.ts`.
- **A card = one word** (single or multi-character). The quiz walks each character;
  results aggregate into one grade for the word.
- **Meaning cleanup** (`cedict.ts`): CC-CEDICT glosses are noisy, so `cleanSenses`
  strips `[pinyin]` refs, `CL:` classifiers, pronunciation/spelling-variant notes
  (`(Taiwan pr. …)`, `(also written …)`), and cross-reference glosses (`variant of`,
  `surname`, `see…`). Helpful parenthetical context is **kept** (`(slang)`,
  `(of a bucktooth)`, `(lit. and fig.)`). `pickBestEntry` skips entries left with
  no real meaning. New cards auto-fill the first 5 senses (`cleanMeaning`); the
  **word detail** sheet (`getWordDetail`) shows *all* readings/senses, uncapped,
  plus a per-character breakdown. Cleanup is lookup-time only — existing cards keep
  their saved text (the detail sheet shows the correct meaning if it's stale).
  Covered in `tests/cedict.test.ts`.
- **Default reading selection** (`cedict.ts`): CC-CEDICT lists a headword's
  entries in no useful order, so `scoreEntry`/`rankEntries` pick the *default*
  reading for a new card. Signals: proper-noun/surname penalty, number of clean
  senses, neutral-tone syllable, classifier presence, and a strong boost for the
  character's customary reading from `public/kmandarin.tsv` (built once by
  `npm run build:kmandarin` via pinyin-pro; build-time only, not in the app
  bundle; precached for offline; loaded with `loadKMandarin`, missing file is
  non-fatal). The Add screen offers the other readings in a per-word dropdown
  (`alternativeEntries`, best-first) so the user can switch (e.g. 几 → `jǐ` not
  `jī`, 东西 → `dōng xi` not "east and west"). Covered in `tests/cedict.test.ts`.
- **Grade suggestion**: 0 stroke mistakes → Good; 1..(againMinMistakes-1) → Hard;
  ≥ againMinMistakes, or any hint/reveal → Again. Easy is never auto-suggested.
- **Daily caps**: new cards and *review-state* cards are capped per day (reset at
  local midnight, counted from `reviewLogs`). Learning/relearning cards are never
  capped. New cards are identified by `introduced === false` / `fsrs === null`.
- **Offline**: each character's stroke data is fetched once (CDN) and cached in
  `charData`; the service worker also runtime-caches it. The dictionary is precached.
- **Stroke leniency** lives in `CharacterQuiz.tsx` (`leniency: 1.5`). The "pop"
  animation scales the completed stroke path about its own centre (`hw-stroke-pop`
  keyframes in index.css); it relies on hanzi-writer's SVG structure (main stroke
  group identified by stroke colour `STROKE_RGBA`).
- **Verifying UI**: run the preview at **430×932** (iPhone 16 Plus). The quiz
  exposes `window.__hanziWriter` in dev so strokes can be driven programmatically;
  `confirm()` dialogs (delete, restore) hang the headless preview — test that
  logic via unit tests instead.

## Deploy

Push to `main` → `.github/workflows/deploy.yml` builds with
`APP_BASE=/HanZi-App/` (derived from repo name) and publishes to GitHub Pages
(~1 min). The Pages environment only allows the default branch (`main`) to deploy.

## Backlog / ideas (not yet built — confirm with the user before starting)

- Expose **stroke leniency** as a Settings slider.
- **File/CSV import** of words (Anki/Pleco exports).
- Built-in **HSK level** word lists.
- **Recognition cards** (see character → recall meaning/pronunciation, self-grade).
- Tone-colour pinyin; audio pronunciation; simple **stats** (reviews/day, retention).
- Per-word **suspend/unsuspend** UI (the data field exists; no UI yet).
- Minor: GitHub Actions still uses Node 20 actions (deprecation warning only).
