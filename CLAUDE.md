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
  App.tsx                  Tab shell (Today / Add / Decks / Settings)
  main.tsx, index.css      Entry (runs initDecks) + all styles (single stylesheet)
  types.ts                 Word, CharResult
  devClock.ts              now(); dev-only time-travel (window.__timeTravel(days))
  db/
    db.ts                  Dexie schema: cards (have deckId), reviewLogs, charData, kv, decks
    cards.ts               add/list/update/delete/move cards (+ deck-scoped dedup)
    decks.ts               decks CRUD, Default deck, initDecks, study toggles
    backup.ts              export/import full data as JSON (v2: includes decks)
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
    TodayScreen.tsx        due/new counts + Study button + per-deck study toggles
    AddWordsScreen.tsx     paste -> lookup -> edit (pick reading + deck) -> save
    DecksScreen.tsx        deck list (counts, create/rename/delete) -> open a deck
    WordListScreen.tsx     one deck's words: sort (added/due) + status badge, inline edit, delete, move (single/multi), detail
    WordDetailView.tsx     full in-flow screen (scrolls with .app-main): card info + full cleaned dictionary entry
    SettingsScreen.tsx     FSRS settings + backup export/import
tests/                     Vitest specs (cedict, cards, decks, scheduler, backup)
scripts/build-dict.mjs     one-off: CC-CEDICT download -> public/cedict.tsv
.github/workflows/deploy.yml  build + deploy to GitHub Pages on push to main
```

## Key conventions & design notes

- **Scheduling is pure and testable.** `buildQueue`/`gradeCard`/`applyGrade` take
  an injected `now` (ms). Tests "time-travel" by passing future timestamps. Keep
  new scheduling logic this way; cover it in `tests/scheduler.test.ts`.
- **A card = one word** (single or multi-character). The quiz walks each character;
  results aggregate into one grade for the word.
- **Decks** (`db/decks.ts`): every card has a `deckId`. A protected built-in
  **"Default"** deck is the fallback (can't be renamed/deleted); `ensureDefaultDeck`
  creates it lazily (transaction-guarded) and `initDecks` (run from `main.tsx` and
  after a backup import) adopts any deck-less cards. The Dexie **v2** upgrade moves
  existing on-device words into Default. **Dedup is deck-scoped by character +
  reading** (`deckId|hanzi|pinyin` in `cards.ts`), so 长 *cháng* and 长 *zhǎng*
  coexist, and the same word can live in two decks. Deleting a deck deletes its
  words and their review logs (`deleteDeck`, behind a `confirm`). The Add screen
  picks a deck per word + a bulk "add all to deck"; the Decks tab manages decks and
  moves words (per-row or tick-box multi-select). Covered in `tests/decks.test.ts`.
- **Study is global but deck-filterable.** `buildQueue` takes
  `{ includeDeckIds }` (omit = all decks). The Today screen shows per-deck toggle
  chips (when >1 deck); the *excluded* deck ids persist in `kv`
  (`loadStudyExclusions`/`saveStudyExclusions`). `ReviewSession` freezes the filter
  at session start so toggling mid-session can't rebuild the queue.
- **Meaning cleanup** (`cedict.ts`): CC-CEDICT glosses are noisy, so `cleanGloss`
  tidies each gloss for a handwriting (recall) card. It **turns character
  cross-references into pinyin** — `您[nin2]` → `nín`, `會水|会水[hui4 shui3]` →
  `huì shuǐ` (via `numberedToToneMarks`) — so the answer character (or a related
  one) can't leak into its own meaning. It strips `CL:` classifiers (standalone
  **and** parenthetical `(CL:…)`), the `(bound form)` grammar label,
  pronunciation/spelling-variant notes (`(Taiwan pr. …)`, `(also written …)`), and
  cross-reference glosses (`variant of`, `surname`, `see…`). Helpful parenthetical
  context is **kept** (`(slang)`, `(of a bucktooth)`, `(literary)`,
  `(lit. and fig.)`) — **including meanings written wholly in parentheses**, which
  is how CC-CEDICT writes particle senses (了 *le* "(completed action marker)",
  吗 *ma* "(question particle…)"); dropping those used to delete the everyday
  reading entirely. `pickBestEntry` skips entries left with no real meaning. New
  cards auto-fill the first 5 senses (`cleanMeaning`); the **word detail** sheet
  (`getWordDetail`) shows *all* readings/senses, uncapped, plus a per-character
  breakdown, plus each reading's **traditional** form when it differs from the
  simplified (an optional 4th column in `cedict.tsv`). Cleanup is lookup-time
  only — existing cards keep their saved text (the detail sheet shows the correct
  meaning if it's stale). Covered in `tests/cedict.test.ts`.
- **Default reading selection** (`cedict.ts`): CC-CEDICT lists a headword's
  entries in no useful order, so `scoreEntry`/`rankEntries` pick the *default*
  reading for a new card. Signals: proper-noun/surname penalty, number of clean
  senses, neutral-tone syllable, classifier presence, and a strong boost for the
  character's customary reading from `public/kmandarin.tsv` (built once by
  `npm run build:kmandarin` via pinyin-pro; build-time only, not in the app
  bundle; precached for offline; loaded with `loadKMandarin`, missing file is
  non-fatal). A small `PARTICLE_READINGS` override outranks even kmandarin for the
  few grammatical particles whose generated reading is the rare one (了 → `le` not
  `liǎo`, 啦 → `la` not `lā`). The Add screen offers the other readings in a
  per-word dropdown (`alternativeEntries`, best-first) so the user can switch
  (e.g. 几 → `jǐ` not `jī`, 东西 → `dōng xi` not "east and west"). Covered in
  `tests/cedict.test.ts`.
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
