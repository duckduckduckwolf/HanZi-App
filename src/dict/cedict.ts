export interface DictEntry {
  hanzi: string;
  pinyin: string;
  meaning: string;
}

let dictPromise: Promise<Map<string, DictEntry[]>> | null = null;

/** Parse the tab-separated dictionary text into a lookup map. */
export function parseCedict(text: string): Map<string, DictEntry[]> {
  const map = new Map<string, DictEntry[]>();
  for (const line of text.split("\n")) {
    if (!line) continue;
    const tab1 = line.indexOf("\t");
    const tab2 = line.indexOf("\t", tab1 + 1);
    if (tab1 === -1 || tab2 === -1) continue;
    const hanzi = line.slice(0, tab1);
    const pinyin = line.slice(tab1 + 1, tab2);
    const meaning = line.slice(tab2 + 1);
    const entry = { hanzi, pinyin, meaning };
    const existing = map.get(hanzi);
    if (existing) existing.push(entry);
    else map.set(hanzi, [entry]);
  }
  return map;
}

/** Load (once) and cache the bundled dictionary. */
export function loadDict(
  fetcher: (url: string) => Promise<string> = defaultFetch
): Promise<Map<string, DictEntry[]>> {
  if (!dictPromise) {
    dictPromise = fetcher(`${import.meta.env.BASE_URL}cedict.tsv`).then(
      parseCedict
    );
  }
  return dictPromise;
}

async function defaultFetch(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load dictionary (${res.status})`);
  return res.text();
}

let kmandarinPromise: Promise<Map<string, string>> | null = null;

/** Parse the char→preferred-reading table (one "char\tpinyin" line each). */
export function parseKMandarin(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    map.set(line.slice(0, tab), line.slice(tab + 1).trim());
  }
  return map;
}

/**
 * Load (once) the bundled "preferred reading" table (public/kmandarin.tsv),
 * used to default to a character's customary reading when it has several. A
 * missing/unreachable file is non-fatal — the scoring heuristics still work
 * without it, so we resolve to an empty map rather than reject.
 */
export function loadKMandarin(
  fetcher: (url: string) => Promise<string> = defaultFetch
): Promise<Map<string, string>> {
  if (!kmandarinPromise) {
    kmandarinPromise = fetcher(`${import.meta.env.BASE_URL}kmandarin.tsv`)
      .then(parseKMandarin)
      .catch(() => new Map<string, string>());
  }
  return kmandarinPromise;
}

// ---------------------------------------------------------------------------
// Meaning cleanup
//
// Raw CC-CEDICT glosses carry a lot of cruft that hurts a recall flashcard:
// pinyin references that spell out the answer (e.g. "深[shen1]"), usage notes
// in parentheses ("(Taiwan pr. ...)", "(bound form)"), classifier lines
// ("CL:..."), and cross-reference-only entries ("old variant of ...",
// "surname ..."). `cleanSenses` turns one raw meaning string into a tidy list
// of distinct senses; `cleanMeaning` is the short, capped version used to
// pre-fill a new card.
// ---------------------------------------------------------------------------

/** Glosses that are pure metadata / cross-references — dropped entirely. */
const DROP_GLOSS =
  /^(CL:|(old )?variant of\b|see\b|abbr\.? for\b|used in\b|surname\b|also written\b|also pr\b|(Taiwan|Mainland) pr\.?\b)/i;

/**
 * Parenthetical notes that are pure metadata (pronunciation / spelling
 * variants) — removed, while genuinely useful context like "(slang)",
 * "(of a bucktooth)", or "(lit. and fig.)" is kept.
 */
const DROP_PAREN =
  /\((Taiwan pr\.|Mainland pr\.|coll\. pr\.|also pr\.|also written)[^)]*\)/gi;

/**
 * Tidy one gloss: remove [pinyin] refs and pronunciation-variant notes, but
 * keep helpful parenthetical context. Returns "" for metadata-only glosses.
 */
function cleanGloss(raw: string): string {
  // Strip CC-CEDICT pinyin references like "深[shen1]" → "深".
  let s = raw.replace(/\[[^\]]*\]/g, "").trim();
  // Decide whether this gloss is a pure cross-reference, ignoring any leading
  // register tags (so "(coll.) variant of …" is still dropped).
  const core = s.replace(/^(\([^)]*\)\s*)+/, "").trim();
  if (!core || DROP_GLOSS.test(core)) return "";
  return s
    .replace(DROP_PAREN, " ") // drop pronunciation/spelling-variant notes
    .replace(/\(\s*\)/g, " ") // drop parens left empty after ref removal
    .replace(/\s+/g, " ")
    .replace(/\s+([;,)])/g, "$1")
    .replace(/^[\s.,;\-–—]+/, "") // leftover leading punctuation (e.g. "... odd")
    .replace(/[\s.,;]+$/, "")
    .trim();
}

/**
 * Turn one raw meaning string ("a; b; c; ...") into a de-duplicated list of
 * clean, display-ready senses. Cross-reference/metadata glosses are removed.
 */
export function cleanSenses(meaning: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of meaning.split(";")) {
    const g = cleanGloss(part);
    if (!g) continue;
    const key = g.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  return out;
}

/** Short meaning for a new card: the first `max` clean senses, joined. */
export function cleanMeaning(meaning: string, max = 5): string {
  return cleanSenses(meaning).slice(0, max).join("; ");
}

/** A reading is "common" when its pinyin is lowercase (proper nouns are capitalised). */
function isCommon(e: DictEntry): boolean {
  return !!e.pinyin && e.pinyin[0] === e.pinyin[0].toLowerCase();
}

/** Vowels that carry a tone mark; a syllable without one is neutral tone. */
const TONED_VOWEL = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

/** Count neutral-tone (unmarked) syllables — a colloquial-everyday-word signal. */
function neutralSyllables(pinyin: string): number {
  let n = 0;
  for (const syl of pinyin.toLowerCase().split(/\s+/)) {
    if (syl && !TONED_VOWEL.test(syl)) n++;
  }
  return n;
}

/** Does the raw gloss list a classifier (CL:…)? Marks a concrete, used noun. */
function hasClassifier(meaning: string): boolean {
  return /(^|;)\s*CL:/.test(meaning);
}

/**
 * Score one entry as a default reading; higher wins. Combines cheap signals
 * from the entry itself with an optional authoritative reading for the
 * character (`preferred`, from the bundled kmandarin table):
 *   - proper-noun / surname readings are pushed down hard;
 *   - more distinct meanings → more commonly used;
 *   - a neutral-tone syllable → the everyday colloquial word;
 *   - a classifier (CL:) → a concrete noun that actually gets used;
 *   - matching the character's customary reading → strong boost.
 * Metadata/cross-reference-only entries (no real sense) score -Infinity.
 */
function scoreEntry(e: DictEntry, preferred?: string): number {
  const senses = cleanSenses(e.meaning).length;
  if (senses === 0) return -Infinity;
  let score = senses * 2;
  if (!isCommon(e)) score -= 100;
  score += neutralSyllables(e.pinyin);
  if (hasClassifier(e.meaning)) score += 1;
  if (preferred && e.pinyin === preferred) score += 50;
  return score;
}

/**
 * Order a headword's entries best-first by `scoreEntry`, dropping
 * metadata-only ones. Ties keep CC-CEDICT's original order (stable sort).
 */
function rankEntries(
  entries: DictEntry[],
  head?: string,
  kmandarin?: Map<string, string>
): DictEntry[] {
  const preferred = head ? kmandarin?.get(head) : undefined;
  return entries
    .map((e, i) => ({ e, i, s: scoreEntry(e, preferred) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
}

/**
 * Pick the most useful entry among several for one headword. Prefers the
 * highest-scoring reading (see `scoreEntry`): skips surname/proper-noun and
 * cross-reference-only readings and defaults to the customary, common one.
 * Pass the character and the kmandarin table to honour its preferred reading.
 */
export function pickBestEntry(
  entries: DictEntry[],
  head?: string,
  kmandarin?: Map<string, string>
): DictEntry {
  return rankEntries(entries, head, kmandarin)[0] ?? entries[0];
}

/**
 * Alternative readings for a headword, cleaned and ready to drop into a card
 * (common readings first, deduped). Used to let the user pick a different
 * entry than the auto-selected default when adding a word.
 */
export function alternativeEntries(
  dict: Map<string, DictEntry[]>,
  word: string,
  kmandarin?: Map<string, string>
): { pinyin: string; meaning: string }[] {
  const entries = dict.get(word);
  if (!entries) return [];
  const out: { pinyin: string; meaning: string }[] = [];
  const seen = new Set<string>();
  // Best-first, so the dropdown's first item matches the auto-filled default.
  for (const e of rankEntries(entries, word, kmandarin)) {
    const meaning = cleanMeaning(e.meaning);
    const key = `${e.pinyin} ${meaning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ pinyin: e.pinyin, meaning });
  }
  return out;
}

/**
 * Look up a whole word. If the exact word is in the dictionary, use it.
 * Otherwise fall back to concatenating each character's own entry so that
 * uncommon compounds still get sensible pinyin. The returned meaning is the
 * short, cleaned form suitable for a new card.
 */
export function lookupWord(
  dict: Map<string, DictEntry[]>,
  word: string,
  kmandarin?: Map<string, string>
): DictEntry | null {
  const direct = dict.get(word);
  if (direct) {
    const best = pickBestEntry(direct, word, kmandarin);
    return { hanzi: word, pinyin: best.pinyin, meaning: cleanMeaning(best.meaning) };
  }

  const chars = Array.from(word);
  if (chars.length <= 1) return null;

  const parts: DictEntry[] = [];
  for (const ch of chars) {
    const e = dict.get(ch);
    if (!e) return null;
    parts.push(pickBestEntry(e, ch, kmandarin));
  }
  return {
    hanzi: word,
    pinyin: parts.map((p) => p.pinyin).join(" "),
    meaning: parts
      .map((p) => `${p.hanzi}: ${cleanSenses(p.meaning)[0] ?? ""}`)
      .join(" + "),
  };
}

// ---------------------------------------------------------------------------
// Word detail (for the "more about this word" view)
// ---------------------------------------------------------------------------

/** One dictionary reading, cleaned for display (all senses, not capped). */
export interface CleanReading {
  pinyin: string;
  senses: string[];
  /** A proper-noun / surname reading (capitalised pinyin). */
  proper: boolean;
}

/** A single character with all of its readings. */
export interface CharDetail {
  hanzi: string;
  readings: CleanReading[];
}

/** Everything we can show about a saved word, built from the dictionary. */
export interface WordDetail {
  hanzi: string;
  /** Readings of the whole word, when it is itself a dictionary headword. */
  readings: CleanReading[];
  /** Per-character breakdown (one entry per character in the word). */
  chars: CharDetail[];
}

function cleanReading(e: DictEntry): CleanReading {
  return { pinyin: e.pinyin, senses: cleanSenses(e.meaning), proper: !isCommon(e) };
}

/**
 * All readings for one headword (character or word), cleaned, with common
 * readings before proper-noun ones, and cross-reference-only readings removed.
 */
export function readingsFor(
  dict: Map<string, DictEntry[]>,
  head: string
): CleanReading[] {
  const entries = dict.get(head);
  if (!entries) return [];
  return entries
    .map(cleanReading)
    .filter((r) => r.senses.length > 0)
    .sort((a, b) => Number(a.proper) - Number(b.proper));
}

/** Build the full, cleaned detail for a word (whole-word + per-character). */
export function getWordDetail(
  dict: Map<string, DictEntry[]>,
  word: string
): WordDetail {
  return {
    hanzi: word,
    readings: readingsFor(dict, word),
    chars: Array.from(word).map((c) => ({ hanzi: c, readings: readingsFor(dict, c) })),
  };
}
