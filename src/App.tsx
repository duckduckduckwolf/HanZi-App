import { useState } from "react";
import PracticeScreen from "./screens/PracticeScreen";
import AddWordsScreen from "./screens/AddWordsScreen";
import WordListScreen from "./screens/WordListScreen";

type Tab = "practice" | "add" | "words";

const TABS: { id: Tab; label: string }[] = [
  { id: "practice", label: "Practice" },
  { id: "add", label: "Add" },
  { id: "words", label: "Words" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("practice");

  return (
    <div className="app">
      <main className="app-main">
        {tab === "practice" && <PracticeScreen />}
        {tab === "add" && <AddWordsScreen />}
        {tab === "words" && <WordListScreen />}
      </main>
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={"tab-btn" + (tab === t.id ? " active" : "")}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
