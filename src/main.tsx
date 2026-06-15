import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initDecks } from "./db/decks";
import "./index.css";

// Make sure the Default deck exists and every word has a deck before the UI
// reads them (covers fresh installs and imported pre-decks backups).
void initDecks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
