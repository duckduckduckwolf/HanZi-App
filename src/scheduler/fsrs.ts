import {
  FSRS,
  Rating,
  State,
  createEmptyCard,
  generatorParameters,
  type Card as FsrsCard,
  type Grade,
  type Steps,
} from "ts-fsrs";
import type { FsrsState } from "../db/db";
import type { Settings } from "./settings";
import type { CharResult } from "../types";

export { Rating, State };

/** Build a configured FSRS engine from the user's settings. */
export function makeEngine(settings: Settings): FSRS {
  return new FSRS(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maximumInterval,
      learning_steps: settings.learningSteps as unknown as Steps,
      enable_fuzz: settings.enableFuzz,
    })
  );
}

/** Convert our stored state into a ts-fsrs Card. */
export function toFsrsCard(state: FsrsState): FsrsCard {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.last_review ? new Date(state.last_review) : undefined,
    learning_steps: state.learning_steps,
  };
}

/** Convert a ts-fsrs Card back into our serialisable stored state. */
export function fromFsrsCard(card: FsrsCard): FsrsState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review
      ? card.last_review.toISOString()
      : undefined,
    learning_steps: card.learning_steps,
  };
}

/** Get the starting ts-fsrs card for one of our cards (new cards start empty). */
function baseCard(state: FsrsState | null, now: Date): FsrsCard {
  return state ? toFsrsCard(state) : createEmptyCard(now);
}

export interface GradeOutcome {
  fsrs: FsrsState;
  dueMs: number;
  scheduledDays: number;
  state: State;
}

/** Apply a grade and return the card's new scheduling state. */
export function applyGrade(
  engine: FSRS,
  state: FsrsState | null,
  rating: Grade,
  now: Date
): GradeOutcome {
  const { card } = engine.next(baseCard(state, now), now, rating);
  return {
    fsrs: fromFsrsCard(card),
    dueMs: card.due.getTime(),
    scheduledDays: card.scheduled_days,
    state: card.state,
  };
}

/** Preview the next due date for each of the four grade buttons. */
export function previewIntervals(
  engine: FSRS,
  state: FsrsState | null,
  now: Date
): Record<Grade, number> {
  const grades: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  const out = {} as Record<Grade, number>;
  for (const g of grades) {
    const { card } = engine.next(baseCard(state, now), now, g);
    out[g] = card.due.getTime();
  }
  return out;
}

/** Aggregate a word's per-character results into the figures grading needs. */
export function aggregateResults(results: CharResult[]) {
  return {
    totalMistakes: results.reduce((s, r) => s + r.mistakes, 0),
    anyHint: results.some((r) => r.usedHint),
    anyRevealed: results.some((r) => r.revealed),
  };
}

/**
 * Suggest a grade from how the writing went.
 * Reveal or hint → Again; no mistakes → Good; a few mistakes → Hard;
 * many mistakes (>= settings.againMinMistakes) → Again. "Easy" is never
 * auto-suggested — the user taps it themselves.
 */
export function suggestRating(
  agg: { totalMistakes: number; anyHint: boolean; anyRevealed: boolean },
  againMinMistakes: number
): Grade {
  if (agg.anyRevealed || agg.anyHint) return Rating.Again;
  if (agg.totalMistakes === 0) return Rating.Good;
  if (agg.totalMistakes >= againMinMistakes) return Rating.Again;
  return Rating.Hard;
}

/** Human-friendly interval label like "1m", "10m", "3d", "2mo", "1.2y". */
export function formatInterval(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months)}mo`;
  const years = days / 365;
  return `${years.toFixed(years < 10 ? 1 : 0)}y`;
}
