import { useEffect, useRef, useState } from "react";
import HanziWriter from "hanzi-writer";
import type { CharResult } from "../types";
import { charDataLoader } from "./charData";

interface Props {
  char: string;
  size: number;
  onResult: (result: CharResult) => void;
}

/** Colour of the real character strokes; also used to find them in the SVG. */
const STROKE_COLOR = "#1a1a1a";
const STROKE_RGBA = "rgba(26,26,26,1)";

/** Average of a list of points (the rough "centre" of where the user drew). */
function centroid(points: { x: number; y: number }[]): { x: number; y: number } {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** How far (in character-grid units) the slide-in may travel, so a wildly
 * placed stroke nudges in tastefully instead of flying across the box. The
 * character grid is ~1024 units wide, so this is about a tenth of the box. */
const MAX_SLIDE = 110;

/** Start the slide partway between where the user drew and the destination,
 * rather than all the way out at the drawn spot — keeps the directional cue
 * but makes the stroke travel a shorter distance. */
const SLIDE_FRACTION = 0.5;

/**
 * Slide the just-completed stroke into place from the direction the user drew
 * it (Skritter-style): if they wrote it too high, it drops down into the right
 * spot; too far left, it slides in from the left, etc. A small overshoot gives
 * it a springy "bounce".
 *
 * hanzi-writer renders each stroke as a clipped <path>; translating it carries
 * the clip along, so the effect stays clean. The drawn points and the stroke's
 * own geometry are both in the character-grid coordinate space (that's the space
 * hanzi-writer grades in), so we can measure the offset there directly — no
 * screen-pixel conversion needed. The translate is applied in that same space
 * and the enclosing group scales it to screen for us.
 */
function popStroke(
  container: HTMLElement,
  strokeNum: number,
  drawnPoints: { x: number; y: number }[]
) {
  const svg = container.querySelector("svg");
  if (!svg) return;
  const groups = svg.querySelectorAll<SVGGElement>(":scope > g > g");
  let main: SVGGElement | null = null;
  groups.forEach((g) => {
    const first = g.children[0] as SVGElement | undefined;
    if (first && first.getAttribute("stroke") === STROKE_RGBA) main = g;
  });
  if (!main) return;
  const path = (main as SVGGElement).children[strokeNum] as
    | SVGPathElement
    | undefined;
  if (!path) return;

  // Direction to slide from = where the user drew minus where the stroke lives.
  let dx = 0;
  let dy = 0;
  if (drawnPoints.length > 0) {
    const drawn = centroid(drawnPoints);
    const box = path.getBBox();
    const strokeCenterX = box.x + box.width / 2;
    const strokeCenterY = box.y + box.height / 2;
    dx = (drawn.x - strokeCenterX) * SLIDE_FRACTION;
    dy = (drawn.y - strokeCenterY) * SLIDE_FRACTION;
    // Clamp the travel distance while keeping the direction.
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_SLIDE) {
      const scale = MAX_SLIDE / dist;
      dx *= scale;
      dy *= scale;
    }
  }

  // For an SVG element, 1px in a CSS transform equals one user unit in the
  // path's local (character-grid) space, so px is the right unit here.
  path.style.transformBox = "fill-box";
  path.style.transformOrigin = "center";
  path.style.setProperty("--pop-dx", `${dx.toFixed(1)}px`);
  path.style.setProperty("--pop-dy", `${dy.toFixed(1)}px`);
  path.classList.remove("hw-stroke-pop");
  // Force reflow so re-adding the class restarts the animation each stroke.
  void path.getBoundingClientRect();
  path.classList.add("hw-stroke-pop");
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
  // Index of the stroke the user still has to draw, so "Hint" can flash it.
  const nextStrokeRef = useRef(0);
  const [status, setStatus] = useState<"loading" | "active" | "error">(
    "loading"
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    mistakesRef.current = 0;
    usedHintRef.current = false;
    doneRef.current = false;
    nextStrokeRef.current = 0;

    const writer = HanziWriter.create(container, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.04),
      showCharacter: false,
      showOutline: false,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      // More forgiving stroke matching — favours memorising the character over
      // perfect penmanship, while still rejecting clearly wrong strokes.
      leniency: 1.2,
      // Quick fade so the spring-pop (added in onCorrectStroke) is what you notice.
      strokeFadeDuration: 120,
      drawingWidth: Math.max(10, Math.round(size * 0.05)),
      drawingColor: "#1a1a1a",
      highlightColor: "#69b1ff",
      outlineColor: "#d4d2cc",
      strokeColor: STROKE_COLOR,
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
      onCorrectStroke: (strokeData) => {
        nextStrokeRef.current = strokeData.strokeNum + 1;
        popStroke(
          container,
          strokeData.strokeNum,
          strokeData.drawnPath.points
        );
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

  // "Show": briefly flash the whole character outline — fade it in, then
  // immediately fade it back out (no hold in between).
  const handleShow = () => {
    const writer = writerRef.current;
    if (!writer || doneRef.current) return;
    usedHintRef.current = true;
    writer.showOutline({ duration: 400 }).then(() => {
      if (!doneRef.current) writer.hideOutline({ duration: 400 });
    });
  };

  // "Hint": flash just the next stroke the user needs to draw.
  const handleHint = () => {
    const writer = writerRef.current;
    if (!writer || doneRef.current) return;
    usedHintRef.current = true;
    writer.highlightStroke(nextStrokeRef.current);
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
        <button onClick={handleShow} data-testid="show-btn">
          Show
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
