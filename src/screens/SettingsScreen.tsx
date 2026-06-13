import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type Settings,
} from "../scheduler/settings";
import { loadSettings, saveSettings } from "../scheduler/settingsStore";
import { exportBackup, importBackup, parseBackup } from "../db/backup";

export default function SettingsScreen() {
  const [form, setForm] = useState<Settings | null>(null);
  const [stepsText, setStepsText] = useState("");
  const [saved, setSaved] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setForm(s);
      setStepsText(s.learningSteps.join(", "));
    });
  }, []);

  if (!form) return <div className="screen">Loading…</div>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    const steps = stepsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const normalized = normalizeSettings({ ...form, learningSteps: steps });
    await saveSettings(normalized);
    setForm(normalized);
    setStepsText(normalized.learningSteps.join(", "));
    setSaved(true);
  };

  const handleReset = async () => {
    await saveSettings(DEFAULT_SETTINGS);
    setForm(DEFAULT_SETTINGS);
    setStepsText(DEFAULT_SETTINGS.learningSteps.join(", "));
    setSaved(true);
  };

  const handleExport = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hanzi-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMsg("Backup file saved.");
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      if (
        !confirm(
          "Restoring will replace ALL current words, history, and settings with the backup. Continue?"
        )
      )
        return;
      await importBackup(backup);
      setBackupMsg("Backup restored. Reloading…");
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  return (
    <div className="screen settings-screen">
      <h2>Settings</h2>

      <section className="settings-group">
        <h3>Review algorithm (FSRS)</h3>

        <label className="setting">
          <span className="setting-label">
            Desired retention
            <small>Higher = see cards more often. 90% is recommended.</small>
          </span>
          <span className="setting-control">
            <input
              type="number"
              min={70}
              max={97}
              value={Math.round(form.desiredRetention * 100)}
              onChange={(e) => set("desiredRetention", Number(e.target.value) / 100)}
              data-testid="retention-input"
            />
            <span className="unit">%</span>
          </span>
        </label>

        <label className="setting">
          <span className="setting-label">New cards per day</span>
          <input
            type="number"
            min={0}
            value={form.newPerDay}
            onChange={(e) => set("newPerDay", Number(e.target.value))}
            data-testid="newperday-input"
          />
        </label>

        <label className="setting">
          <span className="setting-label">Max reviews per day</span>
          <input
            type="number"
            min={0}
            value={form.maxReviewsPerDay}
            onChange={(e) => set("maxReviewsPerDay", Number(e.target.value))}
          />
        </label>

        <label className="setting">
          <span className="setting-label">
            Learning steps
            <small>e.g. "1m, 10m" — short waits before a new card graduates.</small>
          </span>
          <input
            type="text"
            value={stepsText}
            onChange={(e) => {
              setStepsText(e.target.value);
              setSaved(false);
            }}
            data-testid="steps-input"
          />
        </label>

        <label className="setting">
          <span className="setting-label">Maximum interval (days)</span>
          <input
            type="number"
            min={1}
            value={form.maximumInterval}
            onChange={(e) => set("maximumInterval", Number(e.target.value))}
          />
        </label>

        <label className="setting">
          <span className="setting-label">New card order</span>
          <select
            value={form.newCardOrder}
            onChange={(e) => set("newCardOrder", e.target.value as Settings["newCardOrder"])}
          >
            <option value="added">In the order added</option>
            <option value="random">Random</option>
          </select>
        </label>

        <label className="setting">
          <span className="setting-label">
            Fuzz intervals
            <small>Spread reviews out so they don't all land on the same day.</small>
          </span>
          <input
            type="checkbox"
            checked={form.enableFuzz}
            onChange={(e) => set("enableFuzz", e.target.checked)}
          />
        </label>
      </section>

      <section className="settings-group">
        <h3>Grading</h3>
        <label className="setting">
          <span className="setting-label">
            Mistakes for "Again"
            <small>
              Stroke mistakes at or above this auto-suggest Again. Below it
              suggests Hard; a clean write suggests Good.
            </small>
          </span>
          <input
            type="number"
            min={1}
            value={form.againMinMistakes}
            onChange={(e) => set("againMinMistakes", Number(e.target.value))}
            data-testid="again-input"
          />
        </label>
      </section>

      <div className="settings-actions">
        <button className="primary" onClick={handleSave} data-testid="save-settings">
          Save settings
        </button>
        <button onClick={handleReset}>Reset to defaults</button>
        {saved && <span className="saved-note" data-testid="saved-note">Saved ✓</span>}
      </div>

      <section className="settings-group">
        <h3>Backup</h3>
        <p className="hint-text">
          Your words and progress live only on this device. Export a backup file
          regularly, and keep it somewhere safe (e.g. Files or iCloud Drive).
        </p>
        <div className="settings-actions">
          <button onClick={handleExport} data-testid="export-btn">
            Export backup
          </button>
          <button onClick={() => fileRef.current?.click()} data-testid="import-btn">
            Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {backupMsg && <p className="status-text" data-testid="backup-msg">{backupMsg}</p>}
      </section>

      <p className="attribution">
        Dictionary data from CC-CEDICT (CC BY-SA 4.0). Stroke data from Make Me a
        Hanzi via hanzi-writer.
      </p>
    </div>
  );
}
