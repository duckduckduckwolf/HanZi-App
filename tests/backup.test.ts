import { describe, it, expect, beforeEach } from "vitest";
import { db, DEFAULT_DECK_NAME } from "../src/db/db";
import { addCards, getCardsByDeck } from "../src/db/cards";
import { getDefaultDeckId } from "../src/db/decks";
import { saveSettings } from "../src/scheduler/settingsStore";
import { DEFAULT_SETTINGS } from "../src/scheduler/settings";
import {
  exportBackup,
  importBackup,
  parseBackup,
  isBackup,
} from "../src/db/backup";

beforeEach(async () => {
  await db.cards.clear();
  await db.reviewLogs.clear();
  await db.charData.clear();
  await db.kv.clear();
  await db.decks.clear();
});

describe("backup round-trip", () => {
  it("exports and re-imports all data faithfully (incl. decks)", async () => {
    await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire" },
    ]);
    await saveSettings({ ...DEFAULT_SETTINGS, newPerDay: 7 });
    await db.charData.put({ char: "水", data: { strokes: [] } });
    const deckCount = await db.decks.count();
    expect(deckCount).toBeGreaterThanOrEqual(1);

    const backup = await exportBackup();
    expect(backup.version).toBe(2);
    const text = JSON.stringify(backup);

    // wipe everything, then restore from the serialized text
    await db.cards.clear();
    await db.kv.clear();
    await db.charData.clear();
    await db.decks.clear();
    expect(await db.cards.count()).toBe(0);

    await importBackup(parseBackup(text));

    expect(await db.cards.count()).toBe(2);
    expect(await db.charData.count()).toBe(1);
    expect(await db.decks.count()).toBe(deckCount);
    const kv = await db.kv.get("settings");
    expect((kv!.value as { newPerDay: number }).newPerDay).toBe(7);
  });

  it("replaces existing data rather than merging", async () => {
    await addCards([{ hanzi: "水", pinyin: "shuǐ", meaning: "water" }]);
    const backup = await exportBackup();

    await addCards([{ hanzi: "火", pinyin: "huǒ", meaning: "fire" }]);
    expect(await db.cards.count()).toBe(2);

    await importBackup(backup);
    const cards = await db.cards.toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].hanzi).toBe("水");
  });

  it("imports a legacy v1 backup into the Default deck", async () => {
    const legacy = {
      format: "hanzi-app-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: [
        {
          hanzi: "水",
          pinyin: "shuǐ",
          meaning: "water",
          createdAt: 1,
          fsrs: null,
          due: 1,
          introduced: false,
          suspended: false,
        },
      ],
      reviewLogs: [],
      charData: [],
      kv: [],
    };
    expect(isBackup(legacy)).toBe(true);

    await importBackup(legacy as never);

    const defaultId = await getDefaultDeckId();
    const cards = await getCardsByDeck(defaultId);
    expect(cards).toHaveLength(1);
    expect((await db.decks.get(defaultId))!.name).toBe(DEFAULT_DECK_NAME);
  });

  it("rejects invalid files", () => {
    expect(isBackup({ foo: "bar" })).toBe(false);
    expect(() => parseBackup("not json")).toThrow();
    expect(() => parseBackup('{"format":"other"}')).toThrow();
  });
});
