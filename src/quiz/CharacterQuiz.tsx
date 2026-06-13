import { useEffect, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import type { CharResult } from "../types";
import { charDataLoader } from "./charData";

interface Props {
  char: string;
  size: number;
  onResult: (result: CharResult) => void;
}

/**
 * One character's writing quiz: the user draws strokes with finger/mouse,
 * hanzi-writer grades each stroke. Reports mistakes/hint/reveal upward
 * when the character is finished.
 */
export default function CharacterQuiz({ char, size, onResult }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  // Track via refs so callbacks always see current values without re-renders
  const mistakesRef = useRef(0);
  const usedHintRef = useRef(false);
  const doneRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "active" | "error">(
    "loading"
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    mistakesRef.current = 0;
    usedHintRef.current = false;
    doneRef.current = false;

    const writer = HanziWriter.create(container, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.04),
      showCharacter: false,
      showOutline: false,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      drawingWidth: Math.max(10, Math.round(size * 0.05)),
      drawingColor: "#1a1a1a",
      highlightColor: "#69b1ff",
      outlineColor: "#d4d2cc",
      strokeColor: "#1a1a1a",
      charDataLoader,
      onLoadCharDataSuccess: () => setStatus("active"),
      onLoadCharDataError: () => setStatus("error"),
    });
    writerRef.current = writer;

    // Exposed so automated checks can drive the quiz programmatically
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__hanziWriter = writer;
    }

    writer.quiz({
      onMistake: () => {
        mistakesRef.current += 1;
      },
      onComplete: () => {
        if (doneRef.current) return;
        doneRef.current = true;
        // Let the completion highlight play before advancing
        setTimeout(() => {
          onResult({
            char,
            mistakes: mistakesRef.current,
            usedHint: usedHintRef.current,
            revealed: false,
          });
        }, 700);
      },
    });

    return () => {
      writer.cancelQuiz();
      writerRef.current = null;
      container.innerHTML = "";
    };
    // onResult intentionally omitted: parent recreates this component per char via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char, size]);

  const handleHint = () => {
    const writer = writerRef.current;
    if (!writer || doneRef.current) return;
    usedHintRef.current = true;
    writer.showOutline();
    setTimeout(() => {
      if (!doneRef.current) writer.hideOutline();
    }, 2000);
  };

  const handleReveal = () => {
    const writer = writerRef.current;
    if (!writer || doneRef.current) return;
    doneRef.current = true;
    writer.cancelQuiz();
    writer.showCharacter();
    setTimeout(() => {
      onResult({
        char,
        mistakes: mistakesRef.current,
        usedHint: usedHintRef.current,
        revealed: true,
      });
    }, 1500);
  };

  return (
    <div className="char-quiz">
      <div
        className="drawing-box"
        style={{ width: size, height: size }}
        data-testid="drawing-box"
      >
        <GridBackground size={size} />
        <div ref={containerRef} className="writer-target" />
        {status === "error" && (
          <div className="drawing-overlay">
            Couldn't load stroke data for {char}
          </div>
        )}
      </div>
      <div className="quiz-actions">
        <button onClick={handleHint} data-testid="hint-btn">
          Hint
        </button>
        <button onClick={handleReveal} data-testid="reveal-btn">
          Reveal
        </button>
      </div>
    </div>
  );
}

/** The classic practice-grid background (box with cross + diagonals). */
function GridBackground({ size }: { size: number }) {
  const s = size;
  return (
    <svg
      className="grid-bg"
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width={s - 2}
        height={s - 2}
        fill="white"
        stroke="#c9c5bc"
        strokeWidth="2"
        rx="8"
      />
      <line x1={s / 2} y1="4" x2={s / 2} y2={s - 4} stroke="#e8e5de" strokeDasharray="6 6" />
      <line x1="4" y1={s / 2} x2={s - 4} y2={s / 2} stroke="#e8e5de" strokeDasharray="6 6" />
      <line x1="4" y1="4" x2={s - 4} y2={s - 4} stroke="#f0ede6" strokeDasharray="6 6" />
      <line x1={s - 4} y1="4" x2="4" y2={s - 4} stroke="#f0ede6" strokeDasharray="6 6" />
    </svg>
  );
}
