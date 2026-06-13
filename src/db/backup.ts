import { db, type Card, type ReviewLog, type CharData, type KV } from "./db";

/** Everything needed to fully restore the app on another device. */
export interface Backup {
  format: "hanzi-app-backup";
  version: 1;
  exportedAt: string;
  cards: Card[];
  reviewLogs: ReviewLog[];
  charData: CharData[];
  kv: KV[];
}

/** Gather all tables into a single backup object. */
export async function exportBackup(): Promise<Backup> {
  const [cards, reviewLogs, charData, kv] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.charData.toArray(),
    db.kv.toArray(),
  ]);
  return {
    format: "hanzi-app-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    cards,
    reviewLogs,
    charData,
    kv,
  };
}

/** Validate that a parsed object is a backup we can restore. */
export function isBackup(obj: unknown): obj is Backup {
  const b = obj as Backup;
  return (
    !!b &&
    b.format === "hanzi-app-backup" &&
    b.version === 1 &&
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
    db.cards,
    db.reviewLogs,
    db.charData,
    db.kv,
    async () => {
      await Promise.all([
        db.cards.clear(),
        db.reviewLogs.clear(),
        db.charData.clear(),
        db.kv.clear(),
      ]);
      await db.cards.bulkAdd(backup.cards);
      await db.reviewLogs.bulkAdd(backup.reviewLogs);
      await db.charData.bulkAdd(backup.charData);
      await db.kv.bulkAdd(backup.kv);
    }
  );
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
