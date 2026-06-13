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

/**
 * Pick the most useful entry among several for one headword:
 * prefer a common-word reading (lowercase pinyin) over a surname/proper-noun
 * reading (capitalised), otherwise the first listed.
 */
export function pickBestEntry(entries: DictEntry[]): DictEntry {
  const common = entries.find((e) => e.pinyin && e.pinyin[0] === e.pinyin[0].toLowerCase());
  return common ?? entries[0];
}

/**
 * Look up a whole word. If the exact word is in the dictionary, use it.
 * Otherwise fall back to concatenating each character's own entry so that
 * uncommon compounds still get sensible pinyin.
 */
export function lookupWord(
  dict: Map<string, DictEntry[]>,
  word: string
): DictEntry | null {
  const direct = dict.get(word);
  if (direct) return pickBestEntry(direct);

  const chars = Array.from(word);
  if (chars.length <= 1) return null;

  const parts: DictEntry[] = [];
  for (const ch of chars) {
    const e = dict.get(ch);
    if (!e) return null;
    parts.push(pickBestEntry(e));
  }
  return {
    hanzi: word,
    pinyin: parts.map((p) => p.pinyin).join(" "),
    meaning: parts.map((p) => `${p.hanzi}: ${p.meaning.split(";")[0].trim()}`).join(" + "),
  };
}
