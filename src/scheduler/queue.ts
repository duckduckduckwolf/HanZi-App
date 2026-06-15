import { db, type Card, type ReviewLog } from "../db/db";
import { State, makeEngine, applyGrade } from "./fsrs";
import type { Grade } from "ts-fsrs";
import type { Settings } from "./settings";
import type { CharResult } from "../types";
import { aggregateResults } from "./fsrs";

/** Start of the local day containing `now` (ms epoch). */
export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface QueueItem {
  card: Card;
  isNew: boolean;
}

export interface Queue {
  items: QueueItem[];
  /** Due reviews selected for this session (within the daily cap). */
  reviewCount: number;
  /** New cards selected for this session (within the daily cap). */
  newCount: number;
  /** All cards currently due, ignoring caps (for the Today summary). */
  dueTotal: number;
  /** New cards still available to introduce today after the cap. */
  newAvailable: number;
}

function cardState(card: Card): State {
  return (card.fsrs?.state ?? State.New) as State;
}

/** Simple seeded-free shuffle (Fisher–Yates) for the "random" new-card order. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Optional knobs for building the queue. */
export interface BuildQueueOptions {
  /**
   * Restrict the queue to these deck ids. `undefined`/`null` studies all decks
   * (the default); an empty array studies nothing.
   */
  includeDeckIds?: number[] | null;
}

/**
 * Build today's study queue from the database, honouring the daily new-card
 * and review caps. Learning/relearning cards that are due are never capped
 * (they're time-sensitive). Pure inputs: pass `now` so tests can time-travel.
 */
export async function buildQueue(
  settings: Settings,
  now: number = Date.now(),
  opts: BuildQueueOptions = {}
): Promise<Queue> {
  const dayStart = startOfDay(now);
  let allCards = await db.cards.toArray();
  if (opts.includeDeckIds != null) {
    const include = new Set(opts.includeDeckIds);
    allCards = allCards.filter((c) => include.has(c.deckId));
  }
  const active = allCards.filter((c) => !c.suspended);

  const logsToday = await db.reviewLogs
    .where("reviewedAt")
    .aboveOrEqual(dayStart)
    .toArray();
  const reviewsDoneToday = logsToday.filter((l) => !l.wasNew).length;
  const newDoneToday = logsToday.filter((l) => l.wasNew).length;

  // Due cards = introduced and due now or earlier.
  const due = active
    .filter((c) => c.introduced && c.due <= now)
    .sort((a, b) => a.due - b.due);

  const learningDue = due.filter((c) => {
    const s = cardState(c);
    return s === State.Learning || s === State.Relearning;
  });
  const reviewDue = due.filter((c) => cardState(c) === State.Review);

  const reviewCap = Math.max(0, settings.maxReviewsPerDay - reviewsDoneToday);
  const reviewSelected = reviewDue.slice(0, reviewCap);

  // New cards.
  const newPool = active.filter((c) => !c.introduced);
  const orderedNew =
    settings.newCardOrder === "random"
      ? shuffle(newPool)
      : [...newPool].sort((a, b) => a.createdAt - b.createdAt);
  const newCap = Math.max(0, settings.newPerDay - newDoneToday);
  const newSelected = orderedNew.slice(0, newCap);

  const items: QueueItem[] = [
    ...learningDue.map((card) => ({ card, isNew: false })),
    ...reviewSelected.map((card) => ({ card, isNew: false })),
    ...newSelected.map((card) => ({ card, isNew: true })),
  ];

  return {
    items,
    reviewCount: learningDue.length + reviewSelected.length,
    newCount: newSelected.length,
    dueTotal: due.length,
    newAvailable: Math.min(newPool.length, newCap),
  };
}

export interface GradeResult {
  dueMs: number;
  scheduledDays: number;
  /** True if the card is still in (re)learning and due again very soon. */
  inLearning: boolean;
}

/**
 * Grade a card: update its scheduling state, write a review log, and return
 * what happened (so the session can re-queue still-learning cards).
 */
export async function gradeCard(
  card: Card,
  rating: Grade,
  charResults: CharResult[],
  settings: Settings,
  now: number = Date.now()
): Promise<GradeResult> {
  const engine = makeEngine(settings);
  const outcome = applyGrade(engine, card.fsrs, rating, new Date(now));
  const wasNew = !card.introduced;
  const agg = aggregateResults(charResults);

  await db.transaction("rw", db.cards, db.reviewLogs, async () => {
    await db.cards.update(card.id!, {
      fsrs: outcome.fsrs,
      due: outcome.dueMs,
      introduced: true,
    });
    const log: ReviewLog = {
      cardId: card.id!,
      hanzi: card.hanzi,
      reviewedAt: now,
      rating,
      mistakes: agg.totalMistakes,
      usedHint: agg.anyHint,
      revealed: agg.anyRevealed,
      scheduledDays: outcome.scheduledDays,
      wasNew,
    };
    await db.reviewLogs.add(log);
  });

  const inLearning =
    outcome.state === State.Learning || outcome.state === State.Relearning;
  return {
    dueMs: outcome.dueMs,
    scheduledDays: outcome.scheduledDays,
    inLearning,
  };
}
