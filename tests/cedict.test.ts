import { describe, it, expect } from "vitest";
import {
  parseCedict,
  lookupWord,
  pickBestEntry,
  alternativeEntries,
  cleanSenses,
  cleanMeaning,
  getWordDetail,
  numberedToToneMarks,
} from "../src/dict/cedict";

const SAMPLE = [
  "你好\tnǐ hǎo\thello; hi",
  "水\tShuǐ\tsurname Shui",
  "水\tshuǐ\twater; river",
  "学\txué\tto study; to learn",
  "习\txí\tto practise; habit",
  "学习\txué xí\tto learn; to study",
].join("\n");

// Real-world entries that motivated the cleanup (see CLAUDE.md backlog notes).
const TRICKY = [
  "多\tduō\tmany; much; more; a lot of; too many; in excess; (after a numeral) ... odd; how (to what extent) (Taiwan pr. [duo2]); (bound form) multi-; poly-",
  "深\tshēn\told variant of 深[shen1]",
  "深\tshēn\t(lit. and fig.) deep",
  "三\tSān\tsurname San",
  "三\tsān\tthree; 3",
  "中\tZhōng\t(bound form) China; Chinese; surname Zhong",
  "中\tzhōng\twithin; among; in; middle; center; while (doing sth); during; (dialect) OK; all right",
  "中\tzhòng\tto hit (a target); to be struck by (a bullet, illness etc); to win (a prize or lottery)",
  "龅\tbāo\t(of a bucktooth) to protrude; to stick out",
  "牛屄\tniú bī\t(slang) (vulgar) awesome; badass",
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

describe("cleanSenses", () => {
  it("strips pinyin refs but keeps helpful parenthetical context", () => {
    expect(cleanSenses("(of a bucktooth) to protrude; to stick out")).toEqual([
      "(of a bucktooth) to protrude",
      "to stick out",
    ]);
    expect(cleanSenses("(slang) (vulgar) awesome; badass")).toEqual([
      "(slang) (vulgar) awesome",
      "badass",
    ]);
  });

  it("drops pronunciation-variant notes but keeps the meaning", () => {
    // 多's "how (to what extent) (Taiwan pr. [duo2])" → context kept, pr. note gone.
    expect(cleanSenses("how (to what extent) (Taiwan pr. [duo2])")).toEqual([
      "how (to what extent)",
    ]);
  });

  it("drops 'variant of' and surname glosses entirely", () => {
    expect(cleanSenses("old variant of 深[shen1]")).toEqual([]);
    expect(cleanSenses("surname San")).toEqual([]);
    expect(cleanSenses("CL:个[ge4]")).toEqual([]);
    // A cross-reference with a leading register tag is still dropped.
    expect(cleanSenses("(coll.) variant of 拿[na2]")).toEqual([]);
  });

  it("de-duplicates repeated senses", () => {
    expect(cleanSenses("deep; deep; profound")).toEqual(["deep", "profound"]);
  });
});

describe("cleanMeaning", () => {
  it("caps a long entry to the first few real senses", () => {
    const dict = parseCedict(TRICKY);
    const r = lookupWord(dict, "多");
    expect(r?.meaning).toBe("many; much; more; a lot of; too many");
  });

  it("respects a custom cap", () => {
    expect(cleanMeaning("a; b; c; d; e; f", 3)).toBe("a; b; c");
  });
});

describe("pickBestEntry (cleanup)", () => {
  it("skips a cross-reference-only entry in favour of the real meaning", () => {
    const dict = parseCedict(TRICKY);
    // 深 has "old variant of 深[...]" first; the real entry must win (context kept).
    expect(lookupWord(dict, "深")?.meaning).toBe("(lit. and fig.) deep");
  });

  it("skips a surname entry for 三", () => {
    const dict = parseCedict(TRICKY);
    expect(lookupWord(dict, "三")?.meaning).toBe("three; 3");
  });
});

// Heteronyms whose customary reading is NOT the one CC-CEDICT lists first —
// these motivated the "smarter defaults" work (几 jǐ, 东西 dōng xi, …).
const HETERONYMS = [
  "几\tjī\tsmall table",
  "几\tjī\t(literary) almost",
  "几\tjǐ\thow many; how much; several; a few",
  "东西\tdōng xī\teast and west",
  "东西\tdōng xi\tthing; stuff; person; CL:個|个[ge4],件[jian4]",
  "地道\tdì dào\ttunnel; causeway",
  "地道\tdì dao\tauthentic; genuine; proper",
  "大夫\tdà fū\tsenior official (in imperial China)",
  "大夫\tdài fu\tdoctor; physician",
  "长\tcháng\tlength; long; forever; always; constantly",
  "长\tzhǎng\tto grow; to develop; to increase; chief; head; elder; to head; leader",
].join("\n");

describe("smarter defaults", () => {
  it("defaults multi-character words to the everyday reading via heuristics", () => {
    const dict = parseCedict(HETERONYMS);
    // More senses + neutral tone (+ classifier) beat CC-CEDICT's file order,
    // with no preferred-reading table needed for whole words.
    expect(lookupWord(dict, "东西")?.pinyin).toBe("dōng xi"); // not "east and west"
    expect(lookupWord(dict, "地道")?.pinyin).toBe("dì dao"); // not "tunnel"
    expect(lookupWord(dict, "大夫")?.pinyin).toBe("dài fu"); // not "official"
  });

  it("uses meaning-count to beat file order for a single character", () => {
    const dict = parseCedict(HETERONYMS);
    // 几 lists "small table" first; the richer "how many" reading should win.
    expect(lookupWord(dict, "几")?.pinyin).toBe("jǐ");
  });

  it("honours the kmandarin preferred reading when heuristics disagree", () => {
    const dict = parseCedict(HETERONYMS);
    // By meaning-count alone 长 → zhǎng (more glosses)…
    expect(lookupWord(dict, "长")?.pinyin).toBe("zhǎng");
    // …but the preferred-reading table pins it to the customary cháng.
    const km = new Map([["长", "cháng"]]);
    expect(lookupWord(dict, "长", km)?.pinyin).toBe("cháng");
  });

  it("lists alternatives best-first so the default is the dropdown's top item", () => {
    const dict = parseCedict(HETERONYMS);
    const km = new Map([["几", "jǐ"]]);
    const alts = alternativeEntries(dict, "几", km);
    expect(alts[0].pinyin).toBe("jǐ");
    expect(alts.map((a) => a.pinyin)).toContain("jī");
  });
});

describe("getWordDetail", () => {
  it("returns every cleaned reading for a single character", () => {
    const dict = parseCedict(TRICKY);
    const detail = getWordDetail(dict, "中");
    // Common readings first, proper-noun (Zhōng) reading last.
    expect(detail.readings.map((r) => r.pinyin)).toEqual([
      "zhōng",
      "zhòng",
      "Zhōng",
    ]);
    expect(detail.readings[0].senses).toContain("middle");
    expect(detail.readings[1].senses).toContain("to hit (a target)");
    expect(detail.readings[2].proper).toBe(true);
    // Single character → no separate per-character breakdown needed.
    expect(detail.chars).toHaveLength(1);
  });

  it("breaks a compound down per character", () => {
    const dict = parseCedict(SAMPLE);
    const detail = getWordDetail(dict, "学习");
    expect(detail.readings[0].senses).toContain("to learn");
    expect(detail.chars.map((c) => c.hanzi)).toEqual(["学", "习"]);
    expect(detail.chars[0].readings[0].senses).toContain("to study");
  });
});

describe("traditional forms", () => {
  // The optional 4th column carries the traditional headword, written only when
  // it differs from the simplified form (see scripts/build-dict.mjs). So 面's
  // "face" reading has none, but its "noodles" reading (麵) does.
  const TRAD = [
    "面\tmiàn\tface; surface; aspect", // traditional identical → no 4th column
    "面\tmiàn\tflour; noodles\t麵", // traditional differs → 4th column
    "学习\txué xí\tto learn; to study\t學習",
    "学\txué\tto study\t學",
    "习\txí\tto practise\t習",
  ].join("\n");

  it("parses the optional traditional column, leaving it unset when absent", () => {
    const dict = parseCedict(TRAD);
    const mian = dict.get("面")!;
    expect(mian[0].traditional).toBeUndefined();
    expect(mian[1].traditional).toBe("麵");
  });

  it("does not break older 3-column lines", () => {
    const dict = parseCedict(SAMPLE);
    expect(dict.get("你好")![0].traditional).toBeUndefined();
  });

  it("surfaces the traditional form per reading in the word detail", () => {
    const readings = getWordDetail(parseCedict(TRAD), "面").readings;
    expect(readings.find((r) => r.senses.includes("noodles"))?.traditional).toBe(
      "麵"
    );
    // The same-traditional "face" reading exposes nothing.
    expect(
      readings.find((r) => r.senses.includes("face"))?.traditional
    ).toBeUndefined();
  });

  it("shows the traditional form for a whole word and per character", () => {
    const detail = getWordDetail(parseCedict(TRAD), "学习");
    expect(detail.readings[0].traditional).toBe("學習");
    expect(detail.chars[0].readings[0].traditional).toBe("學");
    expect(detail.chars[1].readings[0].traditional).toBe("習");
  });
});

describe("numberedToToneMarks", () => {
  it("places tone marks using the standard rules", () => {
    expect(numberedToToneMarks("nin2")).toBe("nín");
    expect(numberedToToneMarks("hui4 shui3")).toBe("huì shuǐ");
    expect(numberedToToneMarks("ma5")).toBe("ma"); // neutral tone: no mark
    expect(numberedToToneMarks("lu:4")).toBe("lǜ"); // ü written as "u:"
    expect(numberedToToneMarks("xiao3")).toBe("xiǎo"); // "a" takes the mark
    expect(numberedToToneMarks("gou3")).toBe("gǒu"); // "o" in "ou" takes the mark
  });
});

describe("character references become pinyin (no spoilers)", () => {
  // The tested character (or a closely related one) used to leak into its own
  // meaning. CC-CEDICT already annotates these references with pinyin, so we
  // swap the characters for that pinyin instead of showing the character.
  it("converts a single-character reference and drops the character", () => {
    expect(
      cleanSenses("you (informal, as opposed to courteous 您[nin2])")
    ).toEqual(["you (informal, as opposed to courteous nín)"]);
  });

  it("converts a multi-syllable trad|simp reference", () => {
    expect(
      cleanSenses(
        "to swim (used mostly in 會水|会水[hui4 shui3] and 水性[shui3 xing4])"
      )
    ).toEqual(["to swim (used mostly in huì shuǐ and shuǐ xìng)"]);
  });
});

describe("grammar labels", () => {
  // "(bound form)" is pure linguistic metadata; register tags like "(literary)"
  // carry meaning and are kept.
  it("drops the (bound form) label but keeps the meaning and other tags", () => {
    expect(
      cleanSenses("(bound form) to walk; (literary) trip; journey")
    ).toEqual(["to walk", "(literary) trip", "journey"]);
  });

  it("drops a sense that is only the (bound form) label", () => {
    expect(cleanSenses("to grow; (bound form)")).toEqual(["to grow"]);
  });
});

describe("classifier in parentheses", () => {
  // 猫's "cat (CL:隻|只[zhi1])" leaked the classifier into the meaning.
  it("drops a (CL:…) note left inside a meaning", () => {
    expect(
      cleanSenses(
        "cat (CL:隻|只[zhi1]); (dialect) to hide oneself; (loanword) (coll.) modem"
      )
    ).toEqual(["cat", "(dialect) to hide oneself", "(loanword) (coll.) modem"]);
  });
});

// Particles whose meaning CC-CEDICT writes entirely inside parentheses used to
// be discarded as metadata, so the everyday reading vanished from both the
// default and the dropdown, leaving only a rare reading (了→liǎo, 吗→má).
const PARTICLES = [
  "了\tle\t(completed action marker); (modal particle indicating change of state, situation now); (modal particle intensifying preceding clause)",
  "了\tliǎo\tto finish; (literary) completely (not); to understand clearly (variant of 瞭|了[liao3])",
  '吗\tmá\t(coll.) what?',
  "吗\tmǎ\tused in 嗎啡|吗啡[ma3 fei1]",
  '吗\tma\t(question particle for "yes-no" questions)',
  "啦\tlā\t(onom.) sound of singing; (dialect) to chat",
  "啦\tla\tsentence-final particle; particle placed after each item in a list",
].join("\n");

describe("particles (wholly-parenthetical meanings)", () => {
  it("keeps a wholly-parenthetical meaning instead of dropping it", () => {
    expect(cleanSenses("(completed action marker); (modal particle)")).toEqual([
      "(completed action marker)",
      "(modal particle)",
    ]);
  });

  it("defaults 吗 to the question particle ma (not the rare má)", () => {
    const dict = parseCedict(PARTICLES);
    const r = lookupWord(dict, "吗");
    expect(r?.pinyin).toBe("ma");
    expect(r?.meaning).toContain("question particle");
  });

  it("defaults 了 to le, overriding even a liǎo preferred reading", () => {
    const dict = parseCedict(PARTICLES);
    expect(lookupWord(dict, "了")?.pinyin).toBe("le");
    // The generated kmandarin table actually lists 了→liǎo; the override wins.
    const km = new Map([["了", "liǎo"]]);
    expect(lookupWord(dict, "了", km)?.pinyin).toBe("le");
  });

  it("defaults 啦 to the particle la, overriding lā", () => {
    const dict = parseCedict(PARTICLES);
    const km = new Map([["啦", "lā"]]);
    expect(lookupWord(dict, "啦", km)?.pinyin).toBe("la");
  });

  it("still offers both readings of 了, le first", () => {
    const dict = parseCedict(PARTICLES);
    const alts = alternativeEntries(dict, "了");
    expect(alts[0].pinyin).toBe("le");
    expect(alts.map((a) => a.pinyin)).toContain("liǎo");
  });
});
