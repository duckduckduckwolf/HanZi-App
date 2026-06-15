import { db, DEFAULT_DECK_NAME, type Deck } from "./db";

/** kv key under which the Today screen's per-deck study toggles are stored. */
const STUDY_EXCLUSIONS_KEY = "study-deck-exclusions";

/**
 * Return the id of the built-in "Default" deck, creating it if it doesn't
 * exist yet. Runs inside a transaction so two concurrent callers (e.g. app
 * startup + the Add screen) can't each create a second Default.
 */
export async function ensureDefaultDeck(now = Date.now()): Promise<number> {
  return db.transaction("rw", db.decks, async () => {
    const existing = await db.decks
      .where("name")
      .equals(DEFAULT_DECK_NAME)
      .first();
    if (existing) return existing.id!;
    return db.decks.add({ name: DEFAULT_DECK_NAME, createdAt: now });
  });
}

/** Id of the Default deck (the fallback for new/unassigned words). */
export function getDefaultDeckId(): Promise<number> {
  return ensureDefaultDeck();
}

/**
 * Startup safety net: make sure the Default deck exists and that no card is
 * left without a deck. Covers fresh installs, imported v1 backups, and any
 * card the schema upgrade didn't reach.
 */
export async function initDecks(now = Date.now()): Promise<void> {
  const defaultId = await ensureDefaultDeck(now);
  await db.cards
    .filter((c) => c.deckId == null)
    .modify({ deckId: defaultId });
}

/** All decks, Default first, then in the order they were created. */
export async function listDecks(): Promise<Deck[]> {
  const decks = await db.decks.toArray();
  return decks.sort((a, b) => {
    if (a.name === DEFAULT_DECK_NAME) return -1;
    if (b.name === DEFAULT_DECK_NAME) return 1;
    return a.createdAt - b.createdAt;
  });
}

/** Map of deckId → number of words in it (used by the deck list). */
export async function countByDeck(): Promise<Record<number, number>> {
  const counts: Record<number, number> = {};
  await db.cards.each((c) => {
    counts[c.deckId] = (counts[c.deckId] ?? 0) + 1;
  });
  return counts;
}

/**
 * Create a deck. Names are trimmed and de-duplicated case-insensitively, so
 * adding a name that already exists just returns the existing deck's id.
 */
export async function addDeck(name: string, now = Date.now()): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Deck name can't be empty.");
  const existing = (await db.decks.toArray()).find(
    (d) => d.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return existing.id!;
  return db.decks.add({ name: trimmed, createdAt: now });
}

/** Rename a deck. The Default deck can't be renamed. */
export async function renameDeck(id: number, name: string): Promise<void> {
  const deck = await db.decks.get(id);
  if (!deck || deck.name === DEFAULT_DECK_NAME) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const clash = (await db.decks.toArray()).find(
    (d) => d.id !== id && d.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (clash) throw new Error("Another deck already has that name.");
  await db.decks.update(id, { name: trimmed });
}

/**
 * Delete a deck along with all of its words and their review history. The
 * Default deck can't be deleted. Returns how many words were removed.
 */
export async function deleteDeck(id: number): Promise<number> {
  const deck = await db.decks.get(id);
  if (!deck || deck.name === DEFAULT_DECK_NAME) return 0;
  return db.transaction("rw", db.decks, db.cards, db.reviewLogs, async () => {
    const cardIds = (
      await db.cards.where("deckId").equals(id).primaryKeys()
    ) as number[];
    if (cardIds.length) {
      await db.reviewLogs.where("cardId").anyOf(cardIds).delete();
      await db.cards.bulkDelete(cardIds);
    }
    await db.decks.delete(id);
    return cardIds.length;
  });
}

/** Load the set of deck ids the user has toggled OFF for studying. */
export async function loadStudyExclusions(): Promise<number[]> {
  const row = await db.kv.get(STUDY_EXCLUSIONS_KEY);
  const value = row?.value;
  return Array.isArray(value) ? (value as number[]) : [];
}

/** Persist the set of deck ids excluded from study. */
export async function saveStudyExclusions(ids: number[]): Promise<void> {
  await db.kv.put({ key: STUDY_EXCLUSIONS_KEY, value: ids });
}
