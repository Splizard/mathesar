type RowKey = string | number;

/**
 * Assigns the rows rendered by the virtual list to reusable slots.
 *
 * Rows are keyed by slot rather than by row, so when rows scroll out of view
 * and others scroll in, the components that rendered the old rows are reused
 * (their props are updated) instead of destroyed and recreated. Creating and
 * destroying rows was what made fast scrolling slow: after a big jump, every
 * rendered row had to be rebuilt.
 *
 * Rows that stay rendered keep their slot. A slot that last held a "stateful"
 * row (e.g. the row containing the active cell, which may be in edit mode) is
 * never reused for another row; its component is recreated instead, so local
 * state cannot carry over to a different record.
 */
export default class RowSlotAllocator {
  private slotByRowKey = new Map<RowKey, number>();

  private rowKeyBySlot = new Map<number, RowKey>();

  private generationBySlot = new Map<number, number>();

  /**
   * @returns the items in a stable (slot) order, each with a `slotKey` to key
   * the rendered component by.
   */
  assign<T extends { key: RowKey }>(
    items: T[],
    isStatefulRow: (key: RowKey) => boolean,
  ): (T & { slotKey: string })[] {
    const slotByRowKey = new Map<RowKey, number>();
    const rowKeyBySlot = new Map<number, RowKey>();
    const placed: { item: T; slot: number }[] = [];
    const unplaced: T[] = [];

    for (const item of items) {
      const slot = this.slotByRowKey.get(item.key);
      if (slot === undefined) {
        unplaced.push(item);
      } else {
        slotByRowKey.set(item.key, slot);
        rowKeyBySlot.set(slot, item.key);
        placed.push({ item, slot });
      }
    }

    let candidate = 0;
    for (const item of unplaced) {
      while (rowKeyBySlot.has(candidate)) {
        candidate += 1;
      }
      const slot = candidate;
      const previousRowKey = this.rowKeyBySlot.get(slot);
      if (previousRowKey !== undefined && isStatefulRow(previousRowKey)) {
        this.generationBySlot.set(slot, this.getGeneration(slot) + 1);
      }
      slotByRowKey.set(item.key, slot);
      rowKeyBySlot.set(slot, item.key);
      placed.push({ item, slot });
    }

    this.slotByRowKey = slotByRowKey;
    this.rowKeyBySlot = rowKeyBySlot;

    return placed
      .sort((a, b) => a.slot - b.slot)
      .map(({ item, slot }) => ({
        ...item,
        slotKey: `${slot}-${this.getGeneration(slot)}`,
      }));
  }

  private getGeneration(slot: number): number {
    return this.generationBySlot.get(slot) ?? 0;
  }
}
