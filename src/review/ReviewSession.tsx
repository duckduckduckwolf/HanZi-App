import { useEffect, useMemo, useState } from "react";
import type { Grade } from "ts-fsrs";
import CharacterQuiz from "../quiz/CharacterQuiz";
import GradeBar from "./GradeBar";
import WordDetailModal from "../screens/WordDetailModal";
import { db } from "../db/db";
import { buildQueue, gradeCard, type QueueItem } from "../scheduler/queue";
import type { Settings } from "../scheduler/settings";
import type { CharResult } from "../types";
import { now } from "../devClock";

/** Learning-step cards due within this window are shown again this session. */
const REQUEUE_MS = 20 * 60 * 1000;

interface Props {
  settings: Settings;
  onExit: () => void;
}

export default function ReviewSession({ settings, onExit }: Props) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [pos, setPos] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);
  const [phase, setPhase] = useState<"writing" | "grading">("writing");
  const [showDetail, setShowDetail] = useState(false);
  const [graded, setGraded] = useState(0);
  // Frozen timestamp for the current card so previews/grading agree.
  const [cardNow, setCardNow] = useState(() => now());

  const boxSize = useMemo(
    () => Math.min(Math.floor(window.innerWidth) - 40, 360),
    []
  );

  useEffect(() => {
    buildQueue(settings, now()).then((q) => setItems(q.items));
  }, [settings]);

  if (items === null) return <div className="screen">Loading…</div>;

  if (pos >= items.length) {
    return (
      <div className="screen session-done" data-testid="session-done">
        <h2>Done for now 🎉</h2>
        <p>You studied {graded} card{graded === 1 ? "" : "s"} this session.</p>
        <button className="primary" onClick={onExit} data-testid="session-exit">
          Back
        </button>
      </div>
    );
  }

  const item = items[pos];
  const chars = Array.from(item.card.hanzi);

  const handleResult = (result: CharResult) => {
    const nextResults = [...results, result];
    setResults(nextResults);
    if (charIndex + 1 < chars.length) {
      setCharIndex(charIndex + 1);
    } else {
      setPhase("grading");
    }
  };

  const handleGrade = async (rating: Grade) => {
    const t = cardNow;
    const res = await gradeCard(item.card, rating, results, settings, t);
    setGraded((g) => g + 1);

    let nextItems = items;
    // Still in (re)learning and due again very soon → study it again this session.
    if (res.inLearning && res.dueMs - t < REQUEUE_MS) {
      const updated = await db.cards.get(item.card.id!);
      if (updated) nextItems = [...items, { card: updated, isNew: false }];
    }

    setItems(nextItems);
    setPos(pos + 1);
    setCharIndex(0);
    setResults([]);
    setPhase("writing");
    setShowDetail(false);
    setCardNow(now());
  };

  return (
    <div className="screen review-session">
      <div className="session-progress" data-testid="session-progress">
        {pos + 1} / {items.length}
        {item.isNew && <span className="new-badge">new</span>}
      </div>

      <div className="prompt">
        <div className="prompt-meaning" data-testid="prompt-meaning">
          {item.card.meaning}
        </div>
        <div className="prompt-pinyin" data-testid="prompt-pinyin">
          {item.card.pinyin}
        </div>
      </div>

      <div className="char-progress">
        {chars.map((c, i) => (
          <span
            key={i}
            className={
              "char-dot" +
              (i < results.length ? " done" : "") +
              (i === charIndex && phase === "writing" ? " current" : "")
            }
          >
            {i < results.length ? c : "•"}
          </span>
        ))}
      </div>

      {phase === "writing" ? (
        <CharacterQuiz
          key={`${item.card.id}-${pos}-${charIndex}`}
          char={chars[charIndex]}
          size={boxSize}
          onResult={handleResult}
        />
      ) : (
        <div className="grading-phase">
          <div className="summary-hanzi">{item.card.hanzi}</div>
          <button
            className="info-btn"
            onClick={() => setShowDetail(true)}
            data-testid="word-detail-btn"
          >
            ⓘ Details
          </button>
          <GradeBar
            card={item.card}
            results={results}
            settings={settings}
            now={cardNow}
            onGrade={handleGrade}
          />
        </div>
      )}

      <button className="exit-link" onClick={onExit} data-testid="session-quit">
        End session
      </button>

      {showDetail && (
        <WordDetailModal
          hanzi={item.card.hanzi}
          card={item.card}
          onClose={() => setShowDetail(false)}
        />
      )}
    </div>
  );
}
