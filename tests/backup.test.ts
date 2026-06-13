import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/db/db";
import { addCards } from "../src/db/cards";
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
});

describe("backup round-trip", () => {
  it("exports and re-imports all data faithfully", async () => {
    await addCards([
      { hanzi: "水", pinyin: "shuǐ", meaning: "water" },
      { hanzi: "火", pinyin: "huǒ", meaning: "fire" },
    ]);
    await saveSettings({ ...DEFAULT_SETTINGS, newPerDay: 7 });
    await db.charData.put({ char: "水", data: { strokes: [] } });

    const backup = await exportBackup();
    const text = JSON.stringify(backup);

    // wipe everything, then restore from the serialized text
    await db.cards.clear();
    await db.kv.clear();
    await db.charData.clear();
    expect(await db.cards.count()).toBe(0);

    await importBackup(parseBackup(text));

    expect(await db.cards.count()).toBe(2);
    expect(await db.charData.count()).toBe(1);
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

  it("rejects invalid files", () => {
    expect(isBackup({ foo: "bar" })).toBe(false);
    expect(() => parseBackup("not json")).toThrow();
    expect(() => parseBackup('{"format":"other"}')).toThrow();
  });
});
