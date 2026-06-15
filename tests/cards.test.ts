import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/db/db";
import {
  addCards,
  getAllCards,
  getCardsByDeck,
  updateCard,
  deleteCard,
  moveCards,
  sortCards,
} from "../src/db/cards";
import type { Card } from "../src/db/db";
import { addDeck, getDefaultDeckId } from "../src/db/decks";

beforeEach(async () => {
  await db.cards.clear();
  await db.decks.clear();
});

describe("addCards", () => {
  it("adds new cards and reports the count", async () => {
    const res = await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire" },
    ]);
    expect(res.added).toBe(2);
    expect(res.skipped).toEqual([]);
    expect(await getAllCards()).toHaveLength(2);
  });

  it("puts new words in the Default deck when none is given", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const [card] = await getAllCards();
    expect(card.deckId).toBe(await getDefaultDeckId());
  });

  it("skips a same character + same reading already in the same deck", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const res = await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire" },
    ]);
    expect(res.added).toBe(1);
    expect(res.skipped).toEqual(["水"]);
    expect(await getAllCards()).toHaveLength(2);
  });

  it("keeps the same character with a different reading", async () => {
    // 长: cháng (long) vs zhǎng (to grow) are different entries, not a dup.
    await addCards([{ hanzi: "长", pinyin: "cháng", meaning: "long" }]);
    const res = await addCards([{ hanzi: "长", pinyin: "zhǎng", meaning: "to grow" }]);
    expect(res.added).toBe(1);
    expect(res.skipped).toEqual([]);
    expect(await getAllCards()).toHaveLength(2);
  });

  it("keeps the same character + reading when added to a different deck", async () => {
    const other = await addDeck("HSK 1");
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const res = await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water", deckId: other },
    ]);
    expect(res.added).toBe(1);
    expect(res.skipped).toEqual([]);
    expect(await getCardsByDeck(other)).toHaveLength(1);
  });

  it("skips duplicates within the same batch (same deck + reading)", async () => {
    const res = await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "水", pinyin: "shuǐ", meaning: "water (again)" },
    ]);
    expect(res.added).toBe(1);
    expect(res.skipped).toEqual(["水"]);
  });

  it("creates cards as new and not yet due-driven", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const [card] = await getAllCards();
    expect(card.fsrs).toBeNull();
    expect(card.introduced).toBe(false);
    expect(card.suspended).toBe(false);
  });
});

describe("getCardsByDeck / moveCards", () => {
  it("lists only the cards in a given deck", async () => {
    const other = await addDeck("Travel");
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    await addCards([{ hanzi: "山", pinyin: "shān", meaning: "mountain", deckId: other }]);
    expect(await getCardsByDeck(await getDefaultDeckId())).toHaveLength(1);
    expect(await getCardsByDeck(other)).toHaveLength(1);
  });

  it("moves words to another deck", async () => {
    const other = await addDeck("Travel");
    await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire" },
    ]);
    const cards = await getAllCards();
    await moveCards(cards.map((c) => c.id!), other);
    expect(await getCardsByDeck(other)).toHaveLength(2);
    expect(await getCardsByDeck(await getDefaultDeckId())).toHaveLength(0);
  });
});

describe("updateCard / deleteCard", () => {
  it("edits an existing card", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const [card] = await getAllCards();
    await updateCard(card.id!, { meaning: "H2O" });
    const [updated] = await getAllCards();
    expect(updated.meaning).toBe("H2O");
  });

  it("removes a card", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const [card] = await getAllCards();
    await deleteCard(card.id!);
    expect(await getAllCards()).toHaveLength(0);
  });
});

describe("sortCards", () => {
  function card(partial: Partial<Card> & { id: number }): Card {
    return {
      hanzi: "x",
      pinyin: "x",
      meaning: "x",
      createdAt: 0,
      fsrs: null,
      due: 0,
      introduced: false,
      suspended: false,
      deckId: 1,
      ...partial,
    };
  }

  it("'added' orders newest-created first", () => {
    const a = card({ id: 1, createdAt: 100 });
    const b = card({ id: 2, createdAt: 300 });
    const c = card({ id: 3, createdAt: 200 });
    expect(sortCards([a, b, c], "added").map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("'due' orders studied cards by soonest due, with new words last", () => {
    const newOld = card({ id: 1, createdAt: 100 }); // never studied
    const newRecent = card({ id: 2, createdAt: 300 }); // never studied
    const dueSoon = card({ id: 3, createdAt: 50, introduced: true, due: 1000 });
    const dueLater = card({ id: 4, createdAt: 60, introduced: true, due: 5000 });
    const order = sortCards([newOld, dueLater, newRecent, dueSoon], "due").map(
      (x) => x.id
    );
    // studied first, soonest due first (3, 4); then new words, newest-added first (2, 1)
    expect(order).toEqual([3, 4, 2, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [card({ id: 1, createdAt: 100 }), card({ id: 2, createdAt: 300 })];
    sortCards(input, "added");
    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });
});
