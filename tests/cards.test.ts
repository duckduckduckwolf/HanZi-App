import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/db/db";
import {
  addCards,
  getAllCards,
  updateCard,
  deleteCard,
} from "../src/db/cards";

beforeEach(async () => {
  await db.cards.clear();
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

  it("skips duplicates already in the database", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const res = await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire" },
    ]);
    expect(res.added).toBe(1);
    expect(res.skipped).toEqual(["水"]);
    expect(await getAllCards()).toHaveLength(2);
  });

  it("skips duplicates within the same batch", async () => {
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
