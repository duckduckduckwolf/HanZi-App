import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  listDecks,
  countByDeck,
  addDeck,
  renameDeck,
  deleteDeck,
} from "../db/decks";
import { DEFAULT_DECK_NAME, type Deck } from "../db/db";
import WordListScreen from "./WordListScreen";

/**
 * The "Decks" tab. Shows the list of decks (with word counts); tapping a deck
 * opens its word list. Decks can be created, renamed, and deleted here (the
 * built-in Default deck is protected).
 */
export default function DecksScreen() {
  const decks = useLiveQuery(() => listDecks(), []) ?? [];
  const counts = useLiveQuery(() => countByDeck(), []) ?? {};
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedDeck = decks.find((d) => d.id === selectedDeckId) ?? null;

  if (selectedDeck) {
    return (
      <WordListScreen
        deckId={selectedDeck.id!}
        deckName={selectedDeck.name}
        decks={decks}
        onBack={() => setSelectedDeckId(null)}
      />
    );
  }

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await addDeck(name);
      setNewName("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that deck.");
    }
  };

  const handleDelete = async (deck: Deck) => {
    const n = counts[deck.id!] ?? 0;
    const msg =
      n > 0
        ? `Delete "${deck.name}" and its ${n} word${n === 1 ? "" : "s"}? ` +
          `This permanently removes the words and their progress, and can't be undone.`
        : `Delete the empty deck "${deck.name}"?`;
    if (confirm(msg)) await deleteDeck(deck.id!);
  };

  return (
    <div className="screen decks-screen">
      <h2>My decks ({decks.length})</h2>

      <div className="new-deck-row">
        <input
          className="new-deck-input"
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setError(null);
          }}
          placeholder="New deck name"
          aria-label="new deck name"
          data-testid="new-deck-input"
        />
        <button className="primary" onClick={handleAdd} data-testid="add-deck-btn">
          Add
        </button>
      </div>
      {error && <p className="status-text">{error}</p>}

      <ul className="deck-list" data-testid="deck-list">
        {decks.map((deck) =>
          editingId === deck.id ? (
            <DeckEditRow key={deck.id} deck={deck} onDone={() => setEditingId(null)} />
          ) : (
            <li className="deck-row" key={deck.id} data-testid="deck-row">
              <button
                className="deck-main"
                onClick={() => setSelectedDeckId(deck.id!)}
                aria-label={`open ${deck.name}`}
              >
                <span className="deck-name">{deck.name}</span>
                <span className="deck-count">
                  {counts[deck.id!] ?? 0} word{(counts[deck.id!] ?? 0) === 1 ? "" : "s"}
                </span>
              </button>
              {deck.name !== DEFAULT_DECK_NAME && (
                <span className="deck-actions">
                  <button onClick={() => setEditingId(deck.id!)} aria-label={`rename ${deck.name}`}>
                    Rename
                  </button>
                  <button onClick={() => handleDelete(deck)} aria-label={`delete ${deck.name}`}>
                    Delete
                  </button>
                </span>
              )}
            </li>
          )
        )}
      </ul>
    </div>
  );
}

function DeckEditRow({ deck, onDone }: { deck: Deck; onDone: () => void }) {
  const [name, setName] = useState(deck.name);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      await renameDeck(deck.id!, name);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename.");
    }
  };

  return (
    <li className="deck-row editing">
      <input
        className="new-deck-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="deck name"
      />
      <span className="deck-actions">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button onClick={onDone}>Cancel</button>
      </span>
      {error && <p className="status-text">{error}</p>}
    </li>
  );
}
