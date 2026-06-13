import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAllCards, updateCard, deleteCard } from "../db/cards";
import type { Card } from "../db/db";

export default function WordListScreen() {
  const cards = useLiveQuery(() => getAllCards(), []) ?? [];
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="screen list-screen">
      <h2>My words ({cards.length})</h2>
      {cards.length === 0 ? (
        <p className="hint-text">No words yet — add some on the Add tab.</p>
      ) : (
        <ul className="word-list" data-testid="word-list">
          {cards.map((card) =>
            editingId === card.id ? (
              <EditRow
                key={card.id}
                card={card}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <li className="word-row" key={card.id} data-testid="word-row">
                <span className="word-hanzi">{card.hanzi}</span>
                <span className="word-info">
                  <span className="word-pinyin">{card.pinyin}</span>
                  <span className="word-meaning">{card.meaning}</span>
                </span>
                <span className="word-actions">
                  <button onClick={() => setEditingId(card.id!)} aria-label={`edit ${card.hanzi}`}>
                    Edit
                  </button>
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
            )
          )}
        </ul>
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
