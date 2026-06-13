import { db } from "../db/db";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
} from "./settings";

const KEY = "settings";

/** Load settings from storage, falling back to defaults for any missing field. */
export async function loadSettings(): Promise<Settings> {
  const row = await db.kv.get(KEY);
  if (!row) return DEFAULT_SETTINGS;
  return normalizeSettings(row.value as Partial<Settings>);
}

/** Persist settings (normalised). */
export async function saveSettings(settings: Settings): Promise<void> {
  await db.kv.put({ key: KEY, value: normalizeSettings(settings) });
}
