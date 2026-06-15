import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getCardsByDeck,
  updateCard,
  deleteCard,
  moveCards,
  sortCards,
  type CardSort,
} from "../db/cards";
import { dueStatus } from "../scheduler/fsrs";
import { now } from "../devClock";
import type { Card, Deck } from "../db/db";
import WordDetailModal from "./WordDetailModal";

interface Props {
  deckId: number;
  deckName: string;
  /** All decks, so words can be moved to another one. */
  decks: Deck[];
  onBack: () => void;
}

/** The list of words inside one deck: edit, delete, and move (single or many). */
export default function WordListScreen({ deckId, deckName, decks, onBack }: Props) {
  const cards = useLiveQuery(() => getCardsByDeck(deckId), [deckId]) ?? [];
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detailCard, setDetailCard] = useState<Card | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<CardSort>("added");

  const otherDecks = decks.filter((d) => d.id !== deckId);
  const nowMs = now();
  const sorted = useMemo(() => sortCards(cards, sortBy), [cards, sortBy]);

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const moveSelected = async (target: number) => {
    await moveCards([...selected], target);
    setSelected(new Set());
  };

  return (
    <div className="screen list-screen">
      <div className="deck-words-header">
        <button className="back-link" onClick={onBack} aria-label="back to decks">
          ‹ Decks
        </button>
        <h2>
          {deckName} ({cards.length})
        </h2>
      </div>

      {cards.length === 0 ? (
        <p className="hint-text">No words in this deck yet — add some on the Add tab.</p>
      ) : (
        <>
          {cards.length > 1 && (
            <div className="list-sort" data-testid="list-sort">
              <span className="list-sort-label">Sort</span>
              <button
                className={"sort-btn" + (sortBy === "added" ? " on" : "")}
                onClick={() => setSortBy("added")}
                aria-pressed={sortBy === "added"}
              >
                Latest added
              </button>
              <button
                className={"sort-btn" + (sortBy === "due" ? " on" : "")}
                onClick={() => setSortBy("due")}
                aria-pressed={sortBy === "due"}
              >
                Due for review
              </button>
            </div>
          )}

          {selected.size > 0 && otherDecks.length > 0 && (
            <div className="select-toolbar" data-testid="select-toolbar">
              <span>{selected.size} selected</span>
              <select
                aria-label="move selected words to deck"
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) moveSelected(id);
                }}
              >
                <option value="" disabled>
                  Move to…
                </option>
                {otherDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          <ul className="word-list" data-testid="word-list">
            {sorted.map((card) => {
              if (editingId === card.id) {
                return <EditRow key={card.id} card={card} onDone={() => setEditingId(null)} />;
              }
              const status = dueStatus(card, nowMs);
              return (
                <li className="word-row" key={card.id} data-testid="word-row">
                  <input
                    type="checkbox"
                    className="word-select"
                    checked={selected.has(card.id!)}
                    onChange={() => toggleSelected(card.id!)}
                    aria-label={`select ${card.hanzi}`}
                  />
                  <button
                    className="word-main"
                    onClick={() => setDetailCard(card)}
                    aria-label={`details for ${card.hanzi}`}
                  >
                    <span className="word-hanzi">{card.hanzi}</span>
                    <span className="word-info">
                      <span className="word-pinyin">{card.pinyin}</span>
                      <span className="word-meaning">{card.meaning}</span>
                    </span>
                  </button>
                  <span
                    className={"word-status word-status-" + status.kind}
                    data-testid="word-status"
                  >
                    {status.label}
                  </span>
                  <span className="word-actions">
                    <button onClick={() => setEditingId(card.id!)} aria-label={`edit ${card.hanzi}`}>
                      Edit
                    </button>
                    {otherDecks.length > 0 && (
                      <select
                        className="word-move"
                        aria-label={`move ${card.hanzi} to deck`}
                        value=""
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (id) moveCards([card.id!], id);
                        }}
                      >
                        <option value="" disabled>
                          Move…
                        </option>
                        {otherDecks.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${card.hanzi}?`)) deleteCard(card.id!);
                      }}
                      aria-label={`delete ${card.hanzi}`}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {detailCard && (
        <WordDetailModal
          hanzi={detailCard.hanzi}
          card={detailCard}
          onClose={() => setDetailCard(null)}
        />
      )}
    </div>
  );
}

function EditRow({ card, onDone }: { card: Card; onDone: () => void }) {
  const [pinyin, setPinyin] = useState(card.pinyin);
  const [meaning, setMeaning] = useState(card.meaning);

  const save = async () => {
    await updateCard(card.id!, { pinyin, meaning });
    onDone();
  };

  return (
    <li className="word-row editing">
      <span className="word-hanzi">{card.hanzi}</span>
      <span className="word-info">
        <input value={pinyin} onChange={(e) => setPinyin(e.target.value)} aria-label="pinyin" />
        <input value={meaning} onChange={(e) => setMeaning(e.target.value)} aria-label="meaning" />
      </span>
      <span className="word-actions">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button onClick={onDone}>Cancel</button>
      </span>
    </li>
  );
}
