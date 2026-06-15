import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import ReviewSession from "../review/ReviewSession";
import { loadSettings } from "../scheduler/settingsStore";
import { buildQueue } from "../scheduler/queue";
import { countCards } from "../db/cards";
import { listDecks, loadStudyExclusions, saveStudyExclusions } from "../db/decks";
import { now } from "../devClock";

export default function TodayScreen() {
  const [studying, setStudying] = useState(false);

  const settings = useLiveQuery(() => loadSettings(), []);
  const totalCards = useLiveQuery(() => countCards(), []);
  const decks = useLiveQuery(() => listDecks(), []);
  const exclusions = useLiveQuery(() => loadStudyExclusions(), []);

  const excludedSet = new Set(exclusions ?? []);
  const includeDeckIds = (decks ?? [])
    .map((d) => d.id!)
    .filter((id) => !excludedSet.has(id));

  const queue = useLiveQuery(
    async () => (settings ? buildQueue(settings, now(), { includeDeckIds }) : null),
    [settings, studying, includeDeckIds.join(",")]
  );

  if (
    !settings ||
    queue === undefined ||
    queue === null ||
    totalCards === undefined ||
    decks === undefined ||
    exclusions === undefined
  ) {
    return <div className="screen">Loading…</div>;
  }

  if (studying) {
    return (
      <ReviewSession
        settings={settings}
        includeDeckIds={includeDeckIds}
        onExit={() => setStudying(false)}
      />
    );
  }

  const toggleDeck = async (id: number) => {
    const next = new Set(excludedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await saveStudyExclusions([...next]);
  };

  const toStudy = queue.reviewCount + queue.newCount;
  const noneSelected = decks.length > 0 && includeDeckIds.length === 0;

  return (
    <div className="screen today-screen">
      <h2>Today</h2>

      {decks.length > 1 && (
        <div className="deck-toggles" data-testid="deck-toggles">
          {decks.map((d) => (
            <button
              key={d.id}
              className={"deck-chip" + (excludedSet.has(d.id!) ? "" : " on")}
              onClick={() => toggleDeck(d.id!)}
              aria-pressed={!excludedSet.has(d.id!)}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {totalCards === 0 ? (
        <p className="hint-text">
          No words yet. Add some on the <strong>Add</strong> tab to start studying.
        </p>
      ) : noneSelected ? (
        <p className="hint-text">No decks selected. Tap a deck above to study it.</p>
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
