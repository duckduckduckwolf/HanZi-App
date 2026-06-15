import { db, type Card, type ReviewLog, type CharData, type KV, type Deck } from "./db";
import { initDecks } from "./decks";

/** Everything needed to fully restore the app on another device. */
export interface Backup {
  format: "hanzi-app-backup";
  /** 1 = pre-decks; 2 = includes the decks table. */
  version: 1 | 2;
  exportedAt: string;
  cards: Card[];
  reviewLogs: ReviewLog[];
  charData: CharData[];
  kv: KV[];
  /** Present from version 2 onwards. */
  decks?: Deck[];
}

/** Gather all tables into a single backup object. */
export async function exportBackup(): Promise<Backup> {
  const [cards, reviewLogs, charData, kv, decks] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.charData.toArray(),
    db.kv.toArray(),
    db.decks.toArray(),
  ]);
  return {
    format: "hanzi-app-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    cards,
    reviewLogs,
    charData,
    kv,
    decks,
  };
}

/** Validate that a parsed object is a backup we can restore (v1 or v2). */
export function isBackup(obj: unknown): obj is Backup {
  const b = obj as Backup;
  return (
    !!b &&
    b.format === "hanzi-app-backup" &&
    (b.version === 1 || b.version === 2) &&
    Array.isArray(b.cards) &&
    Array.isArray(b.reviewLogs) &&
    Array.isArray(b.charData) &&
    Array.isArray(b.kv)
  );
}

/** Replace all current data with the backup's contents. */
export async function importBackup(backup: Backup): Promise<void> {
  if (!isBackup(backup)) throw new Error("Not a valid HanZi backup file.");
  await db.transaction(
    "rw",
    [db.cards, db.reviewLogs, db.charData, db.kv, db.decks],
    async () => {
      await Promise.all([
        db.cards.clear(),
        db.reviewLogs.clear(),
        db.charData.clear(),
        db.kv.clear(),
        db.decks.clear(),
      ]);
      if (backup.decks?.length) await db.decks.bulkAdd(backup.decks);
      await db.cards.bulkAdd(backup.cards);
      await db.reviewLogs.bulkAdd(backup.reviewLogs);
      await db.charData.bulkAdd(backup.charData);
      await db.kv.bulkAdd(backup.kv);
    }
  );
  // Old (v1) backups have no decks: create Default and adopt any orphan cards.
  await initDecks();
}

/** Parse JSON text into a validated backup. */
export function parseBackup(text: string): Backup {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isBackup(obj)) throw new Error("That file isn't a HanZi backup.");
  return obj;
}
