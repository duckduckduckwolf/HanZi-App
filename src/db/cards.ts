import { db, type Card } from "./db";
import { getDefaultDeckId } from "./decks";
import type { Word } from "../types";

/** Fields needed to create a card. `deckId` defaults to the Default deck. */
export type NewCardInput = Word & { deckId?: number };

/** A brand-new, never-studied card. `due` = createdAt purely for stable ordering. */
function makeCard(input: NewCardInput, deckId: number, now: number): Card {
  return {
    hanzi: input.hanzi.trim(),
    pinyin: input.pinyin.trim(),
    meaning: input.meaning.trim(),
    createdAt: now,
    fsrs: null,
    due: now,
    introduced: false,
    suspended: false,
    deckId,
  };
}

/**
 * Identity of a word within a deck: same character + same reading. Two cards
 * with this key in the same deck are duplicates; a different reading (e.g. 长
 * cháng vs zhǎng) or a different deck is not.
 */
function dedupKey(deckId: number, hanzi: string, pinyin: string): string {
  return `${deckId}|${hanzi.trim()}|${pinyin.trim()}`;
}

/** Add one card. Returns its new id. Skips strokes caching (caller decides). */
export async function addCard(
  input: NewCardInput,
  now = Date.now()
): Promise<number> {
  const deckId = input.deckId ?? (await getDefaultDeckId());
  return db.cards.add(makeCard(input, deckId, now));
}

/**
 * Add several cards at once. A word is skipped only if the same character with
 * the same reading already exists in the same target deck (so the same word can
 * live in different decks, and different readings of a character coexist).
 */
export async function addCards(
  inputs: NewCardInput[],
  now = Date.now()
): Promise<{ added: number; skipped: string[] }> {
  const defaultDeckId = await getDefaultDeckId();
  const existing = new Set(
    (await db.cards.toArray()).map((c) => dedupKey(c.deckId, c.hanzi, c.pinyin))
  );
  const skipped: string[] = [];
  const toAdd: Card[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const hanzi = input.hanzi.trim();
    if (!hanzi) continue;
    const deckId = input.deckId ?? defaultDeckId;
    const key = dedupKey(deckId, hanzi, input.pinyin);
    if (existing.has(key) || seen.has(key)) {
      skipped.push(hanzi);
      continue;
    }
    seen.add(key);
    toAdd.push(makeCard(input, deckId, now));
  }
  if (toAdd.length) await db.cards.bulkAdd(toAdd);
  return { added: toAdd.length, skipped };
}

export function getAllCards(): Promise<Card[]> {
  return db.cards.orderBy("createdAt").reverse().toArray();
}

/** How the word list is ordered. */
export type CardSort = "added" | "due";

/**
 * Order cards for display. Pure (no DB) so it's easy to unit-test.
 * - "added": newest first, by when the card was created.
 * - "due": already-studied cards by soonest due date first; brand-new
 *   (never-studied) words always come last, newest-added first among themselves.
 */
export function sortCards(cards: Card[], sort: CardSort): Card[] {
  const copy = [...cards];
  if (sort === "due") {
    return copy.sort((a, b) => {
      const aNew = !a.introduced;
      const bNew = !b.introduced;
      if (aNew !== bNew) return aNew ? 1 : -1; // new words sink to the bottom
      if (aNew && bNew) return b.createdAt - a.createdAt; // newest-added first
      return a.due - b.due; // both studied: soonest due first
    });
  }
  return copy.sort((a, b) => b.createdAt - a.createdAt);
}

/** Words in one deck, newest first (matches the global list ordering). */
export async function getCardsByDeck(deckId: number): Promise<Card[]> {
  const cards = await db.cards.where("deckId").equals(deckId).toArray();
  return sortCards(cards, "added");
}

export async function updateCard(
  id: number,
  changes: Partial<Pick<Card, "hanzi" | "pinyin" | "meaning" | "suspended" | "deckId">>
): Promise<void> {
  await db.cards.update(id, changes);
}

/** Move one or more words to a different deck. */
export async function moveCards(ids: number[], deckId: number): Promise<void> {
  if (!ids.length) return;
  await db.cards.where("id").anyOf(ids).modify({ deckId });
}

export async function deleteCard(id: number): Promise<void> {
  await db.cards.delete(id);
}

export function countCards(): Promise<number> {
  return db.cards.count();
}
