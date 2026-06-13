import { db, type Card } from "./db";
import type { Word } from "../types";

/** Fields needed to create a card. */
export type NewCardInput = Word;

/** A brand-new, never-studied card. `due` = createdAt purely for stable ordering. */
function makeCard(input: NewCardInput, now: number): Card {
  return {
    hanzi: input.hanzi.trim(),
    pinyin: input.pinyin.trim(),
    meaning: input.meaning.trim(),
    createdAt: now,
    fsrs: null,
    due: now,
    introduced: false,
    suspended: false,
  };
}

/** Add one card. Returns its new id. Skips strokes caching (caller decides). */
export async function addCard(
  input: NewCardInput,
  now = Date.now()
): Promise<number> {
  return db.cards.add(makeCard(input, now));
}

/** Add several cards at once; skips any whose hanzi already exists. */
export async function addCards(
  inputs: NewCardInput[],
  now = Date.now()
): Promise<{ added: number; skipped: string[] }> {
  const existing = new Set((await db.cards.toArray()).map((c) => c.hanzi));
  const skipped: string[] = [];
  const toAdd: Card[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const hanzi = input.hanzi.trim();
    if (!hanzi) continue;
    if (existing.has(hanzi) || seen.has(hanzi)) {
      skipped.push(hanzi);
      continue;
    }
    seen.add(hanzi);
    toAdd.push(makeCard(input, now));
  }
  if (toAdd.length) await db.cards.bulkAdd(toAdd);
  return { added: toAdd.length, skipped };
}

export function getAllCards(): Promise<Card[]> {
  return db.cards.orderBy("createdAt").reverse().toArray();
}

export async function updateCard(
  id: number,
  changes: Partial<Pick<Card, "hanzi" | "pinyin" | "meaning" | "suspended">>
): Promise<void> {
  await db.cards.update(id, changes);
}

export async function deleteCard(id: number): Promise<void> {
  await db.cards.delete(id);
}

export function countCards(): Promise<number> {
  return db.cards.count();
}
