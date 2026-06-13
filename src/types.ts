/** A vocabulary item: a single character or multi-character word. */
export interface Word {
  hanzi: string;
  pinyin: string;
  meaning: string;
}

/** Outcome of writing one character in a quiz. */
export interface CharResult {
  char: string;
  /** Total incorrect stroke attempts. */
  mistakes: number;
  /** User tapped the hint button. */
  usedHint: boolean;
  /** User gave up and revealed the character. */
  revealed: boolean;
}
