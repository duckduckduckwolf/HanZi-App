import { useEffect, useState } from "react";
import { loadDict, getWordDetail } from "../dict/cedict";
import type { CleanReading, WordDetail } from "../dict/cedict";
import type { Card } from "../db/db";

interface Props {
  hanzi: string;
  /** The saved card, if this word is in the deck — shows what you're tested on. */
  card?: Card;
  onClose: () => void;
}

/**
 * A bottom-sheet showing everything we know about a word: the big character,
 * what the card tests you on, and the full (cleaned) dictionary entry —
 * every reading and sense, plus a per-character breakdown for compounds.
 */
export default function WordDetailModal({ hanzi, card, onClose }: Props) {
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    loadDict()
      .then((dict) => {
        if (live) setDetail(getWordDetail(dict, hanzi));
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [hanzi]);

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="word-detail">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="close details">
          ✕
        </button>

        <div className="detail-hanzi">{hanzi}</div>

        {card && (
          <div className="detail-card-info">
            <div className="detail-pinyin">{card.pinyin}</div>
            <div className="detail-meaning">{card.meaning}</div>
          </div>
        )}

        {error && <p className="hint-text">Couldn't load dictionary info.</p>}
        {!detail && !error && <p className="hint-text">Loading…</p>}

        {detail && (
          <div className="detail-body">
            {detail.readings.length > 0 && (
              <section className="detail-section">
                <h3>Dictionary</h3>
                {detail.readings.map((r, i) => (
                  <ReadingBlock key={i} reading={r} />
                ))}
              </section>
            )}

            {detail.chars.length > 1 && (
              <section className="detail-section">
                <h3>Characters</h3>
                {detail.chars.map((c, i) => (
                  <div className="detail-char" key={i}>
                    <span className="detail-char-hanzi">{c.hanzi}</span>
                    <div className="detail-char-readings">
                      {c.readings.length === 0 ? (
                        <span className="hint-text">no dictionary entry</span>
                      ) : (
                        c.readings.map((r, j) => <ReadingBlock key={j} reading={r} />)
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {detail.readings.length === 0 && detail.chars.length === 1 && (
              <p className="hint-text">No dictionary entry for this character.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReadingBlock({ reading }: { reading: CleanReading }) {
  return (
    <div className="detail-reading">
      <span className="detail-reading-pinyin">
        {reading.pinyin}
        {reading.proper && <span className="detail-tag">proper noun</span>}
      </span>
      <span className="detail-reading-senses">{reading.senses.join("; ")}</span>
    </div>
  );
}
