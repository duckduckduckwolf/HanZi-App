// One-time build step: turn the raw CC-CEDICT download into a compact
// tab-separated file the app loads at runtime. Run with `npm run build:dict`.
//
// Output: public/cedict.tsv  — one line per dictionary entry:
//   <simplified>\t<pinyin with tone marks>\t<meaning; meaning; ...>[\t<traditional>]
// The 4th <traditional> column is written only when it differs from the
// simplified headword (most entries are identical), so it's usually absent.
//
// CC-CEDICT is CC BY-SA 4.0 (https://www.mdbg.net/chinese/dictionary?page=cedict).

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const TONE_MARKS = {
  a: ["a", "ā", "á", "ǎ", "à", "a"],
  e: ["e", "ē", "é", "ě", "è", "e"],
  i: ["i", "ī", "í", "ǐ", "ì", "i"],
  o: ["o", "ō", "ó", "ǒ", "ò", "o"],
  u: ["u", "ū", "ú", "ǔ", "ù", "u"],
  "ü": ["ü", "ǖ", "ǘ", "ǚ", "ǜ", "ü"],
};

/** Convert one CC-CEDICT syllable like "hao3" or "lu:4" to "hǎo" / "lǜ". */
function convertSyllable(syl) {
  const m = syl.match(/^([a-zA-Z:]+)([1-5])?$/);
  if (!m) return syl; // punctuation, ·, etc. — leave as-is
  let letters = m[1].replace(/u:/g, "ü").replace(/U:/g, "Ü");
  const tone = m[2] ? Number(m[2]) : 5;
  if (tone === 5) return letters;

  const lower = letters.toLowerCase();
  let idx = -1;
  if (lower.includes("a")) idx = lower.indexOf("a");
  else if (lower.includes("e")) idx = lower.indexOf("e");
  else if (lower.includes("ou")) idx = lower.indexOf("o");
  else {
    // last vowel
    for (let i = letters.length - 1; i >= 0; i--) {
      if ("aeiouü".includes(lower[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) return letters;

  const ch = lower[idx];
  const marked = TONE_MARKS[ch] ? TONE_MARKS[ch][tone] : ch;
  return letters.slice(0, idx) + marked + letters.slice(idx + 1);
}

function convertPinyin(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .map(convertSyllable)
    .join(" ")
    .replace(/\s+·\s+/g, "·");
}

const gz = readFileSync(join(root, "tmp", "cedict.txt.gz"));
const text = gunzipSync(gz).toString("utf8");

const lines = text.split("\n");
const out = [];
let count = 0;
for (const line of lines) {
  if (!line || line.startsWith("#")) continue;
  // Format: Traditional Simplified [pin1 yin1] /def1/def2/
  const m = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/);
  if (!m) continue;
  const traditional = m[1];
  const simplified = m[2];
  const pinyin = convertPinyin(m[3]);
  const defs = m[4]
    .split("/")
    .map((d) => d.trim())
    .filter(Boolean)
    .join("; ");
  if (!defs) continue;
  // Append the traditional headword as an optional 4th column, but only when it
  // differs from the simplified form — most entries are identical, so this keeps
  // the file small and makes "is there a traditional form?" a presence check.
  const tradCol =
    traditional && traditional !== simplified ? `\t${traditional}` : "";
  out.push(`${simplified}\t${pinyin}\t${defs}${tradCol}`);
  count++;
}

const outPath = join(root, "public", "cedict.tsv");
writeFileSync(outPath, out.join("\n"), "utf8");
console.log(`Wrote ${count} entries to public/cedict.tsv`);
