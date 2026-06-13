import { useMemo } from "react";
import type { Grade } from "ts-fsrs";
import type { Card } from "../db/db";
import type { CharResult } from "../types";
import type { Settings } from "../scheduler/settings";
import {
  Rating,
  makeEngine,
  previewIntervals,
  aggregateResults,
  suggestRating,
  formatInterval,
} from "../scheduler/fsrs";

interface Props {
  card: Card;
  results: CharResult[];
  settings: Settings;
  now: number;
  onGrade: (rating: Grade) => void;
}

const BUTTONS: { rating: Grade; label: string }[] = [
  { rating: Rating.Again, label: "Again" },
  { rating: Rating.Hard, label: "Hard" },
  { rating: Rating.Good, label: "Good" },
  { rating: Rating.Easy, label: "Easy" },
];

/** The four Anki-style grade buttons, each showing its next interval, with the
 *  app's suggested grade highlighted. */
export default function GradeBar({ card, results, settings, now, onGrade }: Props) {
  const { intervals, suggested } = useMemo(() => {
    const engine = makeEngine(settings);
    const intervals = previewIntervals(engine, card.fsrs, new Date(now));
    const suggested = suggestRating(aggregateResults(results), settings.againMinMistakes);
    return { intervals, suggested };
  }, [card, results, settings, now]);

  return (
    <div className="grade-bar" data-testid="grade-bar">
      {BUTTONS.map((b) => (
        <button
          key={b.rating}
          className={"grade-btn" + (b.rating === suggested ? " suggested" : "")}
          onClick={() => onGrade(b.rating)}
          data-testid={`grade-${b.label.toLowerCase()}`}
          data-suggested={b.rating === suggested}
        >
          <span className="grade-label">{b.label}</span>
          <span className="grade-interval">{formatInterval(now, intervals[b.rating])}</span>
        </button>
      ))}
    </div>
  );
}
