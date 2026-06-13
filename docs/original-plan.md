# HanZi App — Plan for Version 1

## Context

A personal Chinese-character writing-practice app for your iPhone 16 Plus: Skritter-style handwriting practice (see meaning + pinyin → write the character with your finger, get stroke-by-stroke feedback) combined with Anki-style control over the review schedule. Version 1 is done when you can paste in words, practise writing them daily, have the app schedule reviews, and tweak the algorithm settings yourself.

Your decisions so far: **home-screen web app** (no App Store needed), **simplified characters**, **writing-only cards**, **type/paste to add words** (file import later).

## What the app will be (in plain terms)

A small website that lives entirely on your phone. You open it once in Safari, tap "Add to Home Screen", and from then on it behaves like a normal app: its own icon, full screen, works offline. All your data (words, study history, settings) is stored on the phone itself — no account, no server, nothing leaves your device. Because phone-only storage can theoretically be cleared, the app will include a one-tap **backup/export** button (saves a file you can restore from).

## Technical decisions I'm making (and why)

| Decision | Choice | Why, in plain terms |
|---|---|---|
| App skeleton | **React + TypeScript + Vite** | The most common modern web-app toolkit. TypeScript catches my mistakes automatically, which matters since I'm checking my own work. |
| Handwriting practice | **hanzi-writer** (free, open-source library) | Does exactly what Skritter does: knows the official strokes for 9,000+ characters, watches your finger, accepts/rejects each stroke, shows hints after misses. Battle-tested; far better than building stroke recognition from scratch. |
| Review algorithm | **FSRS** (via the ts-fsrs library) | FSRS is the modern algorithm Anki itself now uses — research-backed and more accurate than Anki's old SM-2. You'll get an Anki-style settings screen: desired retention %, new cards/day, max reviews/day, learning steps, maximum interval, etc. |
| Grading | Auto-suggested, user-overridable | Like Skritter: the app counts your stroke mistakes and suggests Again/Hard/Good/Easy; you can tap a different button to override, like Anki. |
| Dictionary | **CC-CEDICT** (free community dictionary) | When you paste 学习, the app fills in "xuéxí — to study" automatically. You can edit before saving. |
| Words vs characters | Both supported | A multi-character word is one flashcard; the quiz walks you through writing each character in turn. |
| Storage | **IndexedDB** on the phone (via Dexie library) | The standard way websites store real data on-device. Plus the export/backup feature as a safety net. |
| Offline | Stroke data downloaded when you add a word | Each character's stroke data is fetched once at add-time and stored on the phone, so reviews never need internet. |
| Hosting | **GitHub Pages** (free) | The app needs to live at a web address so your phone can install it. GitHub Pages is free and updates automatically when I push changes. Needs a free GitHub account — we'll set that up at the deploy step (I'll flag it when we get there). |

## How I'll work independently and check my own work

1. **Automated tests (Vitest)** for everything with right/wrong answers: the FSRS scheduling (does a card really come back at the right time? do settings changes take effect?), the review queue, dictionary lookup, backup/restore. I run these myself after every change.
2. **A simulated iPhone in a browser preview**: I can run the app on this PC, size the window exactly like an iPhone 16 Plus screen (430×932), click through every screen, simulate finger strokes on the writing quiz, take screenshots, and read error logs — all without your involvement.
3. **Time-travel testing**: a hidden developer switch that lets me pretend days have passed, so I can verify "this card should return in 3 days" without waiting 3 days.
4. **Git version history** from the start, so any change can be undone safely.

You only need to be involved for: trying it on your actual phone, the GitHub account at deploy time, and any product decisions that come up.

## Build order (milestones)

Each milestone ends with something working that I verify before moving on.

1. **Setup** — Install Node.js (the build toolkit) on this PC via winget; create the project skeleton; confirm a placeholder app runs in the iPhone-sized preview. Initialize git.
2. **Writing quiz screen** — hanzi-writer wired up with a few hard-coded words: prompt shows meaning + pinyin, you draw, strokes are graded, mistakes counted, multi-character words walk through each character. Verified with simulated strokes.
3. **Words & storage** — Add Words screen (paste characters → auto-lookup pinyin/meaning → edit → save), word list screen with delete/edit, stroke data cached for offline. Verified with tests + preview.
4. **Scheduling & review sessions** — FSRS integration: Today screen ("12 reviews, 5 new"), review session flow, auto-suggested grades with override buttons, history recorded. Verified with time-travel tests.
5. **Settings screen** — Anki-style options: desired retention, new/day, max reviews/day, learning steps, max interval, new-card order; plus backup export/restore. Verified with tests proving settings change real scheduling behaviour.
6. **Make it a phone app** — App icon, full-screen mode, offline support (service worker), iPhone touch polish (no scroll-bounce while drawing, etc.).
7. **Deploy & install** — Push to GitHub Pages, then walk you through opening it on your iPhone and adding it to the home screen. You study with it; we fix what annoys you.

## Files/structure (roughly)

```
HanZi App/
  src/
    db/         — word storage, settings, review history (Dexie)
    scheduler/  — FSRS wrapper + queue building (heavily unit-tested)
    dict/       — CC-CEDICT lookup
    screens/    — Today, Review (writing quiz), AddWords, WordList, Settings
  tests/        — Vitest tests
```

## Out of scope for v1 (later, if you want)

Built-in HSK lists, file/CSV import, recognition cards, tone-colour display, stats graphs, audio pronunciation, App Store version.
