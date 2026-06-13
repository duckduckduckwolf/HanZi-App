import { useMemo, useState } from "react";
import CharacterQuiz from "../quiz/CharacterQuiz";
import type { CharResult, Word } from "../types";

interface Props {
  words: Word[];
}

/**
 * Cycles through words: shows meaning + pinyin, the user writes each
 * character of the word in turn, then sees a summary and moves on.
 */
export default function PracticeScreen({ words }: Props) {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);

  const word = words[wordIndex % words.length];
  const chars = useMemo(() => Array.from(word.hanzi), [word]);
  const wordDone = results.length === chars.length;

  const boxSize = useMemo(
    () => Math.min(Math.floor(window.innerWidth) - 40, 360),
    []
  );

  const handleResult = (result: CharResult) => {
    setResults((prev) => [...prev, result]);
    if (charIndex + 1 < chars.length) {
      setCharIndex(charIndex + 1);
    }
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
          key={`${wordIndex}-${charIndex}`}
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
