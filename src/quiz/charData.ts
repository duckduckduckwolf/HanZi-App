import type { CharacterJson } from "hanzi-writer";
import { db } from "../db/db";

const CDN = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1";

/** Fetch stroke data for one character from the CDN. */
async function fetchCharData(char: string): Promise<CharacterJson> {
  const res = await fetch(`${CDN}/${encodeURIComponent(char)}.json`);
  if (!res.ok) throw new Error(`No stroke data for ${char} (${res.status})`);
  return res.json();
}

/**
 * Get stroke data for a character, preferring the on-device cache so reviews
 * work offline. Fetches and caches on a miss.
 */
export async function getCharData(char: string): Promise<CharacterJson> {
  const cached = await db.charData.get(char);
  if (cached) return cached.data as CharacterJson;
  const data = await fetchCharData(char);
  await db.charData.put({ char, data });
  return data;
}

/** Pre-download and cache stroke data for every character in a word. */
export async function cacheWordStrokes(word: string): Promise<void> {
  const chars = Array.from(new Set(Array.from(word)));
  await Promise.all(
    chars.map(async (ch) => {
      const existing = await db.charData.get(ch);
      if (!existing) {
        const data = await fetchCharData(ch);
        await db.charData.put({ char: ch, data });
      }
    })
  );
}

/** Loader to hand to hanzi-writer so it reads from our cache. */
export function charDataLoader(
  char: string,
  onLoad: (data: CharacterJson) => void,
  onError: (err?: unknown) => void
) {
  getCharData(char).then(onLoad).catch(onError);
}
