import Dexie, { type Table } from "dexie";

/**
 * One writing flashcard = one word (single character or multi-character).
 * Scheduling fields are filled in by the FSRS scheduler (see src/scheduler).
 * New cards have fsrs === null and are pulled in via the "new cards / day" limit.
 */
export interface Card {
  id?: number;
  hanzi: string;
  pinyin: string;
  meaning: string;
  createdAt: number;
  /** FSRS memory state; null until the card is first studied. */
  fsrs: FsrsState | null;
  /** When the card is next due (ms epoch). Far future for brand-new cards. */
  due: number;
  /** True once the card has left the "new" pool. */
  introduced: boolean;
  suspended: boolean;
  /** Which deck this word belongs to (see the `decks` table). */
  deckId: number;
}

/** A named collection of words. Every card belongs to exactly one deck. */
export interface Deck {
  id?: number;
  name: string;
  createdAt: number;
}

/** Mirrors the fields ts-fsrs needs to resume scheduling a card. */
export interface FsrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  /** ts-fsrs State enum value (0=New,1=Learning,2=Review,3=Relearning). */
  state: number;
  last_review?: string;
  learning_steps: number;
}

/** A single grading event, kept for history/stats and FSRS optimisation later. */
export interface ReviewLog {
  id?: number;
  cardId: number;
  hanzi: string;
  reviewedAt: number;
  /** ts-fsrs Rating: 1=Again, 2=Hard, 3=Good, 4=Easy. */
  rating: number;
  /** Total stroke mistakes across the word that session. */
  mistakes: number;
  usedHint: boolean;
  revealed: boolean;
  /** Interval (days) the scheduler assigned after this review. */
  scheduledDays: number;
  /** True if this was the card's first-ever review (a new-card introduction). */
  wasNew: boolean;
}

/** Cached hanzi-writer stroke data so reviews work offline. */
export interface CharData {
  char: string;
  data: unknown;
}

/** App-wide key/value store (settings live here under a single key). */
export interface KV {
  key: string;
  value: unknown;
}

/** Name of the built-in fallback deck (protected: can't be renamed/deleted). */
export const DEFAULT_DECK_NAME = "Default";

export class HanziDB extends Dexie {
  cards!: Table<Card, number>;
  reviewLogs!: Table<ReviewLog, number>;
  charData!: Table<CharData, string>;
  kv!: Table<KV, string>;
  decks!: Table<Deck, number>;

  constructor(name = "hanzi-app") {
    super(name);
    this.version(1).stores({
      cards: "++id, hanzi, createdAt, due, introduced, suspended",
      reviewLogs: "++id, cardId, reviewedAt",
      charData: "char",
      kv: "key",
    });
    // v2 adds decks: every word now belongs to a deck. Existing words move into
    // a new "Default" deck so nothing is lost on upgrade.
    this.version(2)
      .stores({
        cards: "++id, hanzi, createdAt, due, introduced, suspended, deckId",
        reviewLogs: "++id, cardId, reviewedAt",
        charData: "char",
        kv: "key",
        decks: "++id, name, createdAt",
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        const defaultId = (await tx
          .table("decks")
          .add({ name: DEFAULT_DECK_NAME, createdAt: now })) as number;
        await tx
          .table("cards")
          .toCollection()
          .modify((card: Card) => {
            card.deckId = defaultId;
          });
      });
  }
}

export const db = new HanziDB();
