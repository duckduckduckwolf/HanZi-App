/**
 * Anki-style, user-editable scheduling settings. Defaults are sensible for a
 * daily learner; every field is exposed on the Settings screen.
 */
export interface Settings {
  /** Target probability of recall when a card comes due (0.70–0.97). */
  desiredRetention: number;
  /** Max brand-new cards to introduce per day. */
  newPerDay: number;
  /** Max due reviews (mature cards) per day. Learning cards aren't capped. */
  maxReviewsPerDay: number;
  /** Short-term steps for a freshly introduced / lapsed card, e.g. ["1m","10m"]. */
  learningSteps: string[];
  /** Hard ceiling on how far out a card can be scheduled (days). */
  maximumInterval: number;
  /** Order new cards are introduced. */
  newCardOrder: "added" | "random";
  /** Add a little randomness to intervals so cards don't clump. */
  enableFuzz: boolean;
  /** Stroke mistakes at or above this auto-suggest "Again". (0 → Good, 1..n-1 → Hard.) */
  againMinMistakes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  desiredRetention: 0.9,
  newPerDay: 10,
  maxReviewsPerDay: 200,
  learningSteps: ["1m", "10m"],
  maximumInterval: 36500,
  newCardOrder: "added",
  enableFuzz: true,
  againMinMistakes: 3,
};

/** Clamp/repair settings loaded from storage so bad values can't break scheduling. */
export function normalizeSettings(input: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...input };
  return {
    desiredRetention: clamp(s.desiredRetention, 0.7, 0.97),
    newPerDay: Math.max(0, Math.round(s.newPerDay)),
    maxReviewsPerDay: Math.max(0, Math.round(s.maxReviewsPerDay)),
    learningSteps:
      Array.isArray(s.learningSteps) && s.learningSteps.length
        ? s.learningSteps.filter((x) => /^\d+(\.\d+)?[mhd]$/.test(x))
        : DEFAULT_SETTINGS.learningSteps,
    maximumInterval: clamp(Math.round(s.maximumInterval), 1, 36500),
    newCardOrder: s.newCardOrder === "random" ? "random" : "added",
    enableFuzz: !!s.enableFuzz,
    againMinMistakes: Math.max(1, Math.round(s.againMinMistakes)),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
