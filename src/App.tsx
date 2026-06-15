import { useState } from "react";
import TodayScreen from "./screens/TodayScreen";
import AddWordsScreen from "./screens/AddWordsScreen";
import DecksScreen from "./screens/DecksScreen";
import SettingsScreen from "./screens/SettingsScreen";

type Tab = "today" | "add" | "decks" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "add", label: "Add" },
  { id: "decks", label: "Decks" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div className="app">
      <main className="app-main">
        {tab === "today" && <TodayScreen />}
        {tab === "add" && <AddWordsScreen />}
        {tab === "decks" && <DecksScreen />}
        {tab === "settings" && <SettingsScreen />}
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
