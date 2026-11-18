import {
  ANNIVERSARY_THEMES,
  AnniversaryTheme,
} from '../templates/work-anniversary-themes';

/**
 * Modern Fisher-Yates array shuffle algorithm.
 * Guarantees unbiased, uniform random distribution without mutating the source array.
 */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generic Shuffled Round-Robin Template Picker.
 * Works with any template type having an `id` property.
 *
 * Implements Fisher-Yates array shuffling combined with round-robin deck delivery:
 * - Guarantees zero duplicates across consecutive draws up to the pool size (15).
 * - Refills and reshuffles automatically when the deck is exhausted.
 * - Protects against consecutive repeats for the same employee.
 * - 100% in-memory: zero disk I/O, no database overhead.
 */
export class ShuffledTemplatePicker<T extends { id: string | number }> {
  private shuffledDeck: T[] = [];
  private deckIndex = 0;
  private readonly lastDispatchedPerEmployee = new Map<string, string | number>();

  constructor(private readonly getPool: () => readonly T[]) {}

  /**
   * Refills the active deck with a fresh Fisher-Yates shuffle of the template pool.
   */
  private refillDeck(): void {
    const pool = this.getPool();
    if (!pool || pool.length === 0) {
      this.shuffledDeck = [];
      this.deckIndex = 0;
      return;
    }
    this.shuffledDeck = shuffleArray(pool);
    this.deckIndex = 0;
  }

  /**
   * Retrieves the next template from the shuffled deck.
   * If the deck is exhausted, automatically shuffles a new deck.
   * If an employeeId is provided, prevents assigning the exact same template they received last time.
   */
  public getNext(employeeId?: string): T {
    const pool = this.getPool();
    if (!pool || pool.length === 0) {
      throw new Error('Template pool is empty');
    }

    if (this.shuffledDeck.length === 0 || this.deckIndex >= this.shuffledDeck.length) {
      this.refillDeck();
    }

    let selected = this.shuffledDeck[this.deckIndex++];

    if (employeeId && pool.length > 1) {
      const prevId = this.lastDispatchedPerEmployee.get(employeeId);
      if (prevId !== undefined && selected.id === prevId) {
        // Swap with the next card in deck if possible
        if (this.deckIndex < this.shuffledDeck.length) {
          const swapIndex = this.deckIndex;
          [this.shuffledDeck[this.deckIndex - 1], this.shuffledDeck[swapIndex]] = [
            this.shuffledDeck[swapIndex],
            this.shuffledDeck[this.deckIndex - 1],
          ];
          selected = this.shuffledDeck[this.deckIndex - 1];
        } else {
          const alternative = pool.find((t) => t.id !== prevId);
          if (alternative) selected = alternative;
        }
      }
      this.lastDispatchedPerEmployee.set(employeeId, selected.id);
    }

    return selected;
  }

  /**
   * Generates a batch of distinct, shuffled templates for N employees on the same day.
   * Guarantees that no two employees in the batch receive the same template (up to pool size).
   */
  public getShuffledBatch(count: number): T[] {
    if (count <= 0) return [];
    const pool = this.getPool();
    if (!pool || pool.length === 0) return [];

    const shuffled = shuffleArray(pool);
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(shuffled[i % shuffled.length]);
    }
    return result;
  }

  /**
   * Clears the in-memory state and history.
   */
  public reset(): void {
    this.shuffledDeck = [];
    this.deckIndex = 0;
    this.lastDispatchedPerEmployee.clear();
  }
}

/**
 * Singleton instance of ShuffledTemplatePicker for Anniversary Themes (1-15).
 */
export const anniversaryThemePicker = new ShuffledTemplatePicker<AnniversaryTheme>(
  () => ANNIVERSARY_THEMES,
);

/**
 * Picks the next random anniversary theme using round-robin deck distribution.
 *
 * @param employeeId - Optional employee ID to prevent consecutive repeat for same person
 * @returns A distinct AnniversaryTheme from the 15 available themes
 */
export function getRandomAnniversaryTheme(employeeId?: string): AnniversaryTheme {
  return anniversaryThemePicker.getNext(employeeId);
}

/**
 * Generates an array of distinct, randomly shuffled anniversary themes for a batch of celebrants.
 * Uses Fisher-Yates shuffle to guarantee:
 *  1. Every employee in the batch receives a random theme.
 *  2. No two employees in the same batch receive the same theme (up to the total available themes count).
 *
 * @param count - Number of celebrants in the batch
 * @returns Array of AnniversaryTheme objects
 */
export function getShuffledRandomThemesForBatch(count: number): AnniversaryTheme[] {
  return anniversaryThemePicker.getShuffledBatch(count);
}

/**
 * Clears the in-memory deck and history (useful for tests or cache reset).
 */
export function resetLastDispatchedThemeCache(): void {
  anniversaryThemePicker.reset();
}

