import { describe, it, expect } from "vitest";
import {
  parseCedict,
  lookupWord,
  pickBestEntry,
} from "../src/dict/cedict";

const SAMPLE = [
  "你好\tnǐ hǎo\thello; hi",
  "水\tShuǐ\tsurname Shui",
  "水\tshuǐ\twater; river",
  "学\txué\tto study; to learn",
  "习\txí\tto practise; habit",
  "学习\txué xí\tto learn; to study",
].join("\n");

describe("parseCedict", () => {
  it("indexes entries by simplified headword", () => {
    const dict = parseCedict(SAMPLE);
    expect(dict.get("你好")).toEqual([
      { hanzi: "你好", pinyin: "nǐ hǎo", meaning: "hello; hi" },
    ]);
    expect(dict.get("水")).toHaveLength(2);
  });
});

describe("pickBestEntry", () => {
  it("prefers a common-word reading over a surname/proper-noun one", () => {
    const dict = parseCedict(SAMPLE);
    const best = pickBestEntry(dict.get("水")!);
    expect(best.pinyin).toBe("shuǐ");
    expect(best.meaning).toContain("water");
  });
});

describe("lookupWord", () => {
  it("returns a direct match when the whole word exists", () => {
    const dict = parseCedict(SAMPLE);
    const r = lookupWord(dict, "学习");
    expect(r?.pinyin).toBe("xué xí");
  });

  it("falls back to per-character lookup for unknown compounds", () => {
    const dict = parseCedict(SAMPLE);
    // remove the compound so it must compose from single chars
    dict.delete("学习");
    const r = lookupWord(dict, "学习");
    expect(r?.pinyin).toBe("xué xí");
    expect(r?.meaning).toContain("学:");
    expect(r?.meaning).toContain("习:");
  });

  it("returns null when a character is missing entirely", () => {
    const dict = parseCedict(SAMPLE);
    expect(lookupWord(dict, "火")).toBeNull();
  });
});
