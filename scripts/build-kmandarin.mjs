// One-time build step: produce a compact "preferred reading" table for the
// characters that have more than one Mandarin reading (heteronyms), so the Add
// screen can default to the customary reading instead of CC-CEDICT's file order.
// Run with `npm run build:kmandarin`.
//
// Output: public/kmandarin.tsv  — one line per heteronym character:
//   <character>\t<preferred pinyin, exactly as it appears in cedict.tsv>
//
// Source of the "most common reading" is the pinyin-pro package (corpus-based
// heteronym resolution), used here only at build time — it is NOT shipped in
// the app bundle. We pin the result to the exact cedict.tsv pinyin string so
// the runtime can match it with a plain string comparison.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pinyin } from "pinyin-pro";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Normalise a syllable for comparison (lowercase, u:/v → ü). */
const norm = (p) => p.toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü").trim();

// Group cedict's single-character headwords by their distinct readings.
const cedict = readFileSync(join(root, "public", "cedict.tsv"), "utf8");
const byChar = new Map(); // char -> DictEntry-like { pinyin }[]
for (const line of cedict.split("\n")) {
  if (!line) continue;
  const tab1 = line.indexOf("\t");
  const tab2 = line.indexOf("\t", tab1 + 1);
  if (tab1 === -1 || tab2 === -1) continue;
  const hanzi = line.slice(0, tab1);
  if (Array.from(hanzi).length !== 1) continue; // single characters only
  const py = line.slice(tab1 + 1, tab2);
  const list = byChar.get(hanzi) ?? [];
  list.push(py);
  byChar.set(hanzi, list);
}

const out = [];
let skipped = 0;
for (const [ch, pinyins] of byChar) {
  // Only true heteronyms matter: ≥2 distinct readings ignoring tone-less case
  // differences (so surname-only splits like 水 Shuǐ/shuǐ are excluded).
  const distinct = new Set(pinyins.map(norm));
  if (distinct.size < 2) continue;

  // pinyin-pro's primary (most common) reading for this character.
  const preferred = pinyin(ch, { toneType: "symbol", type: "array", multiple: false })[0];
  if (!preferred) continue;

  // Pin it to the exact cedict spelling so the app can string-match it,
  // preferring the common (lowercase-initial) spelling over a surname/proper
  // one when both exist (e.g. 中 "zhōng" not "Zhōng").
  const candidates = pinyins.filter((py) => norm(py) === norm(preferred));
  const match =
    candidates.find((py) => py[0] === py[0].toLowerCase()) ?? candidates[0];
  if (!match) {
    skipped++;
    continue; // pinyin-pro suggested a reading cedict doesn't list — leave to heuristics
  }
  out.push(`${ch}\t${match}`);
}

out.sort();
const outPath = join(root, "public", "kmandarin.tsv");
writeFileSync(outPath, out.join("\n"), "utf8");
console.log(
  `Wrote ${out.length} preferred readings to public/kmandarin.tsv` +
    (skipped ? ` (${skipped} chars skipped: no matching cedict reading)` : "")
);
