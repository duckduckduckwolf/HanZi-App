import { describe, it, expect, beforeEach } from "vitest";
import { db, DEFAULT_DECK_NAME } from "../src/db/db";
import {
  ensureDefaultDeck,
  getDefaultDeckId,
  initDecks,
  listDecks,
  countByDeck,
  addDeck,
  renameDeck,
  deleteDeck,
  loadStudyExclusions,
  saveStudyExclusions,
} from "../src/db/decks";
import { addCards, getCardsByDeck } from "../src/db/cards";

beforeEach(async () => {
  await db.cards.clear();
  await db.reviewLogs.clear();
  await db.kv.clear();
  await db.decks.clear();
});

describe("default deck", () => {
  it("creates the Default deck once and reuses it", async () => {
    const a = await ensureDefaultDeck();
    const b = await ensureDefaultDeck();
    expect(a).toBe(b);
    const defaults = (await db.decks.toArray()).filter(
      (d) => d.name === DEFAULT_DECK_NAME
    );
    expect(defaults).toHaveLength(1);
  });

  it("survives concurrent callers without duplicating", async () => {
    const ids = await Promise.all([
      ensureDefaultDeck(),
      ensureDefaultDeck(),
      ensureDefaultDeck(),
    ]);
    expect(new Set(ids).size).toBe(1);
  });

  it("adopts orphan cards on init", async () => {
    // A card written directly with no deckId (mimics a pre-decks card).
    await db.cards.add({
      hanzi: "水",
      pinyin: "shuǐ",
      meaning: "water",
      createdAt: 1,
      fsrs: null,
      due: 1,
      introduced: false,
      suspended: false,
    } as never);
    await initDecks();
    const defaultId = await getDefaultDeckId();
    expect(await getCardsByDeck(defaultId)).toHaveLength(1);
  });
});

describe("deck CRUD", () => {
  it("lists Default first, then by creation order", async () => {
    await ensureDefaultDeck();
    await addDeck("Bravo");
    await addDeck("Alpha");
    const names = (await listDecks()).map((d) => d.name);
    expect(names[0]).toBe(DEFAULT_DECK_NAME);
    expect(names.slice(1)).toEqual(["Bravo", "Alpha"]);
  });

  it("de-duplicates deck names case-insensitively", async () => {
    const a = await addDeck("Travel");
    const b = await addDeck("travel");
    expect(a).toBe(b);
  });

  it("rejects an empty deck name", async () => {
    await expect(addDeck("   ")).rejects.toThrow();
  });

  it("renames a deck but never the Default", async () => {
    const id = await addDeck("Trip");
    await renameDeck(id, "Holiday");
    expect((await db.decks.get(id))!.name).toBe("Holiday");

    const defaultId = await ensureDefaultDeck();
    await renameDeck(defaultId, "Renamed");
    expect((await db.decks.get(defaultId))!.name).toBe(DEFAULT_DECK_NAME);
  });

  it("refuses to rename onto an existing name", async () => {
    await addDeck("Alpha");
    const b = await addDeck("Bravo");
    await expect(renameDeck(b, "alpha")).rejects.toThrow();
  });

  it("counts words per deck", async () => {
    const other = await addDeck("Food");
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    await addCards([{ hanzi: "米", pinyin: "mǐ", meaning: "rice", deckId: other }]);
    const counts = await countByDeck();
    expect(counts[await getDefaultDeckId()]).toBe(1);
    expect(counts[other]).toBe(1);
  });
});

describe("deleteDeck", () => {
  it("deletes the deck, its words, and their review history", async () => {
    const other = await addDeck("Temp");
    await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water", deckId: other },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire", deckId: other },
    ]);
    const cards = await getCardsByDeck(other);
    await db.reviewLogs.add({
      cardId: cards[0].id!,
      hanzi: "水",
      reviewedAt: Date.now(),
      rating: 3,
      mistakes: 0,
      usedHint: false,
      revealed: false,
      scheduledDays: 1,
      wasNew: true,
    });

    const removed = await deleteDeck(other);
    expect(removed).toBe(2);
    expect(await db.decks.get(other)).toBeUndefined();
    expect(await getCardsByDeck(other)).toHaveLength(0);
    expect(await db.reviewLogs.where("cardId").equals(cards[0].id!).count()).toBe(0);
  });

  it("never deletes the Default deck", async () => {
    const defaultId = await ensureDefaultDeck();
    const removed = await deleteDeck(defaultId);
    expect(removed).toBe(0);
    expect(await db.decks.get(defaultId)).toBeDefined();
  });
});

describe("study exclusions", () => {
  it("round-trips the excluded deck ids", async () => {
    expect(await loadStudyExclusions()).toEqual([]);
    await saveStudyExclusions([2, 5]);
    expect(await loadStudyExclusions()).toEqual([2, 5]);
  });
});
