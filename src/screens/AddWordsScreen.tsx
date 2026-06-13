import { useState } from "react";
import { loadDict, lookupWord } from "../dict/cedict";
import { addCards } from "../db/cards";
import { cacheWordStrokes } from "../quiz/charData";

interface Draft {
  hanzi: string;
  pinyin: string;
  meaning: string;
  found: boolean;
}

/** Split pasted text into individual words (Chinese has no internal spaces). */
function splitWords(text: string): string[] {
  const tokens = text.split(/[\s,，、;；]+/).filter(Boolean);
  // keep only tokens that contain at least one CJK character
  return tokens.filter((t) => /[一-鿿]/.test(t));
}

export default function AddWordsScreen() {
  const [raw, setRaw] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleLookup = async () => {
    setStatus(null);
    const words = Array.from(new Set(splitWords(raw)));
    if (words.length === 0) {
      setStatus("No Chinese characters found in the box above.");
      return;
    }
    setBusy(true);
    try {
      const dict = await loadDict();
      const next: Draft[] = words.map((hanzi) => {
        const entry = lookupWord(dict, hanzi);
        return {
          hanzi,
          pinyin: entry?.pinyin ?? "",
          meaning: entry?.meaning ?? "",
          found: !!entry,
        };
      });
      setDrafts(next);
    } catch {
      setStatus("Couldn't load the dictionary. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (i: number, field: keyof Draft, value: string) => {
    setDrafts((prev) =>
      prev.map((d, j) => (j === i ? { ...d, [field]: value } : d))
    );
  };

  const removeDraft = (i: number) => {
    setDrafts((prev) => prev.filter((_, j) => j !== i));
  };

  const handleSave = async () => {
    const valid = drafts.filter((d) => d.hanzi.trim());
    if (valid.length === 0) return;
    setBusy(true);
    setStatus("Saving and downloading stroke data…");
    try {
      const { added, skipped } = await addCards(
        valid.map((d) => ({ hanzi: d.hanzi, pinyin: d.pinyin, meaning: d.meaning }))
      );
      // Cache stroke data so these words can be reviewed offline.
      const failures: string[] = [];
      await Promise.all(
        valid.map(async (d) => {
          try {
            await cacheWordStrokes(d.hanzi);
          } catch {
            failures.push(d.hanzi);
          }
        })
      );
      let msg = `Added ${added} word${added === 1 ? "" : "s"}.`;
      if (skipped.length) msg += ` Skipped ${skipped.length} already in your list.`;
      if (failures.length)
        msg += ` Couldn't fetch strokes for: ${failures.join(", ")} (no handwriting data).`;
      setStatus(msg);
      setDrafts([]);
      setRaw("");
    } catch {
      setStatus("Something went wrong while saving.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen add-screen">
      <h2>Add words</h2>
      <p className="hint-text">
        Paste or type Chinese words — one per line, or separated by spaces or
        commas. The app fills in pinyin and meaning for you to check.
      </p>
      <textarea
        className="word-input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={"你好\n学习\n水"}
        rows={4}
        data-testid="word-input"
      />
      <button
        className="primary"
        onClick={handleLookup}
        disabled={busy}
        data-testid="lookup-btn"
      >
        Look up
      </button>

      {status && <p className="status-text" data-testid="status-text">{status}</p>}

      {drafts.length > 0 && (
        <div className="draft-list" data-testid="draft-list">
          {drafts.map((d, i) => (
            <div className={"draft-row" + (d.found ? "" : " not-found")} key={i}>
              <div className="draft-hanzi">{d.hanzi}</div>
              <div className="draft-fields">
                <input
                  value={d.pinyin}
                  onChange={(e) => updateDraft(i, "pinyin", e.target.value)}
                  placeholder="pinyin"
                  aria-label={`pinyin for ${d.hanzi}`}
                />
                <input
                  value={d.meaning}
                  onChange={(e) => updateDraft(i, "meaning", e.target.value)}
                  placeholder="meaning"
                  aria-label={`meaning for ${d.hanzi}`}
                />
              </div>
              <button className="draft-remove" onClick={() => removeDraft(i)} aria-label={`remove ${d.hanzi}`}>
                ✕
              </button>
            </div>
          ))}
          <button
            className="primary save-btn"
            onClick={handleSave}
            disabled={busy}
            data-testid="save-btn"
          >
            Add {drafts.length} word{drafts.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
