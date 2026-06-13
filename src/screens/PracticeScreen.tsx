import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import CharacterQuiz from "../quiz/CharacterQuiz";
import { getAllCards } from "../db/cards";
import type { CharResult } from "../types";

/**
 * Free practice: cycles through all saved words (no scheduling yet — the
 * spaced-repetition review flow arrives in the next milestone). Shows
 * meaning + pinyin, the user writes each character, then a summary.
 */
export default function PracticeScreen() {
  const cards = useLiveQuery(() => getAllCards(), []);
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);

  const boxSize = useMemo(
    () => Math.min(Math.floor(window.innerWidth) - 40, 360),
    []
  );

  if (cards === undefined) {
    return <div className="screen">Loading…</div>;
  }
  if (cards.length === 0) {
    return (
      <div className="screen practice-screen">
        <p className="hint-text">
          No words yet. Add some on the <strong>Add</strong> tab, then come back
          to practise writing them.
        </p>
      </div>
    );
  }

  const word = cards[wordIndex % cards.length];
  const chars = Array.from(word.hanzi);
  const wordDone = results.length === chars.length;

  const handleResult = (result: CharResult) => {
    setResults((prev) => [...prev, result]);
    if (charIndex + 1 < chars.length) setCharIndex(charIndex + 1);
  };

  const nextWord = () => {
    setWordIndex(wordIndex + 1);
    setCharIndex(0);
    setResults([]);
  };

  const totalMistakes = results.reduce((sum, r) => sum + r.mistakes, 0);
  const anyRevealed = results.some((r) => r.revealed);
  const anyHint = results.some((r) => r.usedHint);

  return (
    <div className="practice-screen">
      <div className="prompt">
        <div className="prompt-meaning" data-testid="prompt-meaning">
          {word.meaning}
        </div>
        <div className="prompt-pinyin" data-testid="prompt-pinyin">
          {word.pinyin}
        </div>
      </div>

      <div className="char-progress" data-testid="char-progress">
        {chars.map((c, i) => (
          <span
            key={i}
            className={
              "char-dot" +
              (i < results.length ? " done" : "") +
              (i === charIndex && !wordDone ? " current" : "")
            }
          >
            {i < results.length ? c : "•"}
          </span>
        ))}
      </div>

      {!wordDone ? (
        <CharacterQuiz
          key={`${word.id}-${charIndex}`}
          char={chars[charIndex]}
          size={boxSize}
          onResult={handleResult}
        />
      ) : (
        <div className="word-summary" data-testid="word-summary">
          <div className="summary-hanzi">{word.hanzi}</div>
          <p>
            {anyRevealed
              ? "Revealed — keep practising this one."
              : totalMistakes === 0
                ? anyHint
                  ? "Correct, with a hint."
                  : "Perfect, no mistakes!"
                : `Done, with ${totalMistakes} stroke mistake${totalMistakes === 1 ? "" : "s"}.`}
          </p>
          <button className="primary" onClick={nextWord} data-testid="next-word-btn">
            Next word
          </button>
        </div>
      )}
    </div>
  );
}
