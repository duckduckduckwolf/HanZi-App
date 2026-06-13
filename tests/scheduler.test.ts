import { describe, it, expect, beforeEach } from "vitest";
import { db, type Card } from "../src/db/db";
import { DEFAULT_SETTINGS, type Settings } from "../src/scheduler/settings";
import {
  makeEngine,
  applyGrade,
  suggestRating,
  formatInterval,
  Rating,
  State,
} from "../src/scheduler/fsrs";
import { buildQueue, gradeCard } from "../src/scheduler/queue";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-06-13T09:00:00").getTime();

beforeEach(async () => {
  await db.cards.clear();
  await db.reviewLogs.clear();
});

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

async function addNewCard(hanzi: string, createdAt = T0): Promise<Card> {
  const id = await db.cards.add({
    hanzi,
    pinyin: "",
    meaning: "",
    createdAt,
    fsrs: null,
    due: createdAt,
    introduced: false,
    suspended: false,
  });
  return (await db.cards.get(id))!;
}

describe("suggestRating", () => {
  const s = DEFAULT_SETTINGS.againMinMistakes;
  it("maps clean writing to Good", () => {
    expect(suggestRating({ totalMistakes: 0, anyHint: false, anyRevealed: false }, s)).toBe(Rating.Good);
  });
  it("maps a few mistakes to Hard", () => {
    expect(suggestRating({ totalMistakes: 2, anyHint: false, anyRevealed: false }, s)).toBe(Rating.Hard);
  });
  it("maps many mistakes to Again", () => {
    expect(suggestRating({ totalMistakes: 3, anyHint: false, anyRevealed: false }, s)).toBe(Rating.Again);
  });
  it("maps hint or reveal to Again regardless of mistakes", () => {
    expect(suggestRating({ totalMistakes: 0, anyHint: true, anyRevealed: false }, s)).toBe(Rating.Again);
    expect(suggestRating({ totalMistakes: 0, anyHint: false, anyRevealed: true }, s)).toBe(Rating.Again);
  });
});

describe("formatInterval", () => {
  it("formats minutes, days, months", () => {
    expect(formatInterval(T0, T0 + 10 * 60000)).toBe("10m");
    expect(formatInterval(T0, T0 + 3 * DAY)).toBe("3d");
    expect(formatInterval(T0, T0 + 60 * DAY)).toBe("2mo");
  });
});

describe("applyGrade scheduling", () => {
  const engine = makeEngine(settings());

  it("keeps a new card in learning and due in minutes after Good", () => {
    const out = applyGrade(engine, null, Rating.Good, new Date(T0));
    expect(out.state).toBe(State.Learning);
    const mins = (out.dueMs - T0) / 60000;
    expect(mins).toBeGreaterThanOrEqual(5);
    expect(mins).toBeLessThanOrEqual(20);
  });

  it("graduates a new card to review (days out) after Easy", () => {
    const out = applyGrade(engine, null, Rating.Easy, new Date(T0));
    expect(out.state).toBe(State.Review);
    expect((out.dueMs - T0) / DAY).toBeGreaterThanOrEqual(1);
  });

  it("brings a new card back almost immediately after Again", () => {
    const out = applyGrade(engine, null, Rating.Again, new Date(T0));
    const mins = (out.dueMs - T0) / 60000;
    expect(mins).toBeLessThanOrEqual(2);
  });

  it("higher desired retention yields shorter intervals", () => {
    const low = applyGrade(makeEngine(settings({ desiredRetention: 0.8 })), null, Rating.Easy, new Date(T0));
    const high = applyGrade(makeEngine(settings({ desiredRetention: 0.95 })), null, Rating.Easy, new Date(T0));
    expect(high.dueMs).toBeLessThan(low.dueMs);
  });
});

describe("buildQueue caps", () => {
  it("limits new cards to newPerDay", async () => {
    for (let i = 0; i < 5; i++) await addNewCard("字" + i, T0 + i);
    const q = await buildQueue(settings({ newPerDay: 2 }), T0 + DAY);
    expect(q.newCount).toBe(2);
    expect(q.items.filter((it) => it.isNew)).toHaveLength(2);
  });

  it("introduces new cards in added order by default", async () => {
    await addNewCard("第一", T0 + 1);
    await addNewCard("第二", T0 + 2);
    await addNewCard("第三", T0 + 3);
    const q = await buildQueue(settings({ newPerDay: 2 }), T0 + DAY);
    expect(q.items.map((it) => it.card.hanzi)).toEqual(["第一", "第二"]);
  });

  it("excludes suspended cards", async () => {
    const c = await addNewCard("水", T0);
    await db.cards.update(c.id!, { suspended: true });
    const q = await buildQueue(settings(), T0 + DAY);
    expect(q.items).toHaveLength(0);
  });

  it("counts already-introduced new cards against today's cap", async () => {
    await addNewCard("a", T0 + 1);
    await addNewCard("b", T0 + 2);
    // introduce one earlier today
    const card = (await db.cards.toArray())[0];
    await gradeCard(card, Rating.Good, [], settings({ newPerDay: 1 }), T0 + 60000);
    const q = await buildQueue(settings({ newPerDay: 1 }), T0 + 2 * 60000);
    expect(q.newCount).toBe(0); // cap of 1 already used today
  });
});

describe("end-to-end review timing (time travel)", () => {
  it("a card studied today does not reappear until it is actually due", async () => {
    const card = await addNewCard("学", T0);
    // Introduce + graduate to review with Easy (days-long interval).
    const r1 = await gradeCard(card, Rating.Easy, [], settings(), T0);
    expect(r1.inLearning).toBe(false);
    expect(r1.scheduledDays).toBeGreaterThanOrEqual(1);

    // Same day: should NOT be due.
    const sameDay = await buildQueue(settings(), T0 + 60 * 60 * 1000);
    expect(sameDay.dueTotal).toBe(0);

    // After its scheduled interval: it SHOULD be due.
    const updated = (await db.cards.get(card.id!))!;
    const after = await buildQueue(settings(), updated.due + 60000);
    expect(after.dueTotal).toBe(1);
    expect(after.items[0].card.hanzi).toBe("学");
  });

  it("Again on a review card sends it back to (re)learning, due soon", async () => {
    const card = await addNewCard("难", T0);
    await gradeCard(card, Rating.Easy, [], settings(), T0); // → Review
    const reviewCard = (await db.cards.get(card.id!))!;
    const r = await gradeCard(reviewCard, Rating.Again, [{ char: "难", mistakes: 5, usedHint: false, revealed: false }], settings(), reviewCard.due);
    expect(r.inLearning).toBe(true);
    expect((r.dueMs - reviewCard.due) / DAY).toBeLessThan(1);
  });

  it("daily review cap resets the next day", async () => {
    // Two due review cards.
    for (const h of ["甲", "乙"]) {
      const c = await addNewCard(h, T0);
      await gradeCard(c, Rating.Easy, [], settings(), T0);
    }
    // Force both due well in the future and study with a cap of 1.
    const cards = await db.cards.toArray();
    const dueDay = T0 + 30 * DAY;
    for (const c of cards) await db.cards.update(c.id!, { due: dueDay });

    const day1 = await buildQueue(settings({ maxReviewsPerDay: 1 }), dueDay);
    expect(day1.reviewCount).toBe(1);
    await gradeCard(day1.items[0].card, Rating.Good, [], settings({ maxReviewsPerDay: 1 }), dueDay);

    // Still day 1: cap reached.
    const day1b = await buildQueue(settings({ maxReviewsPerDay: 1 }), dueDay + 60000);
    expect(day1b.reviewCount).toBe(0);

    // Next day: cap resets, the remaining due card shows.
    const day2 = await buildQueue(settings({ maxReviewsPerDay: 1 }), dueDay + DAY);
    expect(day2.reviewCount).toBeGreaterThanOrEqual(1);
  });
});
