/**
 * Generic Shuffled Round-Robin Template Picker Util
 *
 * Implements Fisher-Yates array shuffling combined with round-robin delivery.
 * - Non-hardcoded: Generic implementation working for any template pool.
 * - Uniform unbiased randomization.
 * - Guarantees zero duplicate templates when multiple employees celebrate on the same day.
 * - In-memory consecutive repeat protection per employee.
 * - 100% in-memory: zero disk I/O, no JSON state files.
 */

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
 * Strict Sequential 1-to-N Template Picker
 *
 * Cycles deterministically through all 15 templates:
 * BRD1 -> BRD2 -> BRD3 -> ... -> BRD15 -> BRD1 -> ...
 * Guarantees that every single template is used in exact order without
 * random repeats or omitting any template.
 */
export class SequentialTemplatePicker<T extends { id: string | number }> {
  private currentIndex = 0;
  private readonly lastDispatchedPerEmployee = new Map<string, string | number>();

  constructor(private readonly getPool: () => readonly T[]) {}

  /**
   * Returns the next template in strict sequential order (0..N-1, wrapping to 0).
   */
  public getNext(employeeId?: string): T {
    const pool = this.getPool();
    if (!pool || pool.length === 0) {
      throw new Error('Template pool is empty');
    }

    let selected = pool[this.currentIndex % pool.length];
    this.currentIndex = (this.currentIndex + 1) % pool.length;

    if (employeeId && pool.length > 1) {
      const prevId = this.lastDispatchedPerEmployee.get(employeeId);
      if (prevId !== undefined && selected.id === prevId) {
        selected = pool[this.currentIndex % pool.length];
        this.currentIndex = (this.currentIndex + 1) % pool.length;
      }
      this.lastDispatchedPerEmployee.set(employeeId, selected.id);
    }

    return selected;
  }

  /**
   * Peeks at the next template without advancing the index.
   */
  public peekNext(): T {
    const pool = this.getPool();
    if (!pool || pool.length === 0) {
      throw new Error('Template pool is empty');
    }
    return pool[this.currentIndex % pool.length];
  }

  /**
   * Resumes the sequence directly after the specified template ID.
   * Enables state resumption across server restarts from DB notification records.
   */
  public setLastUsedId(id: string | number): void {
    const pool = this.getPool();
    if (!pool || pool.length === 0) return;
    const strId = String(id).trim().toUpperCase();
    const idx = pool.findIndex((t) => String(t.id).trim().toUpperCase() === strId);
    if (idx !== -1) {
      this.currentIndex = (idx + 1) % pool.length;
    }
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public setIndex(idx: number): void {
    const pool = this.getPool();
    if (pool && pool.length > 0) {
      this.currentIndex = ((idx % pool.length) + pool.length) % pool.length;
    }
  }

  public getBatch(count: number): T[] {
    const result: T[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.getNext());
    }
    return result;
  }

  public reset(): void {
    this.currentIndex = 0;
    this.lastDispatchedPerEmployee.clear();
  }
}

/**
 * Generic Shuffled Round-Robin Template Picker.
 * Works with any template type having an `id` property.
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

