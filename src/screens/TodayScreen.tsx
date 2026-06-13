import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import ReviewSession from "../review/ReviewSession";
import { loadSettings } from "../scheduler/settingsStore";
import { buildQueue } from "../scheduler/queue";
import { countCards } from "../db/cards";
import { now } from "../devClock";

export default function TodayScreen() {
  const [studying, setStudying] = useState(false);

  const settings = useLiveQuery(() => loadSettings(), []);
  const totalCards = useLiveQuery(() => countCards(), []);
  const queue = useLiveQuery(
    async () => (settings ? buildQueue(settings, now()) : null),
    [settings, studying]
  );

  if (!settings || queue === undefined || queue === null || totalCards === undefined) {
    return <div className="screen">Loading…</div>;
  }

  if (studying) {
    return <ReviewSession settings={settings} onExit={() => setStudying(false)} />;
  }

  const toStudy = queue.reviewCount + queue.newCount;

  return (
    <div className="screen today-screen">
      <h2>Today</h2>

      {totalCards === 0 ? (
        <p className="hint-text">
          No words yet. Add some on the <strong>Add</strong> tab to start studying.
        </p>
      ) : toStudy === 0 ? (
        <div className="today-card">
          <p className="all-done">All caught up 🎉</p>
          <p className="hint-text">Nothing due right now. Check back later.</p>
        </div>
      ) : (
        <div className="today-card">
          <div className="today-counts">
            <span className="count-num" data-testid="due-count">
              {queue.reviewCount}
            </span>
            <span className="count-label">due review{queue.reviewCount === 1 ? "" : "s"}</span>
          </div>
          <div className="today-counts">
            <span className="count-num" data-testid="new-count">
              {queue.newCount}
            </span>
            <span className="count-label">new to learn</span>
          </div>
          <button
            className="primary study-btn"
            onClick={() => setStudying(true)}
            data-testid="study-btn"
          >
            Study {toStudy} card{toStudy === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}
