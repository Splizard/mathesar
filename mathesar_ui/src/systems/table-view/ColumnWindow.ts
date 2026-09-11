interface ColumnPosition {
  left: number;
  width: number;
}

/**
 * Decides which columns the table view renders cells for: those within (or a
 * margin beyond) the horizontally visible part of the sheet. Wide tables would
 * otherwise render every column of every row although only a few fit on
 * screen.
 *
 * `alwaysInclude` columns are rendered regardless of position; the column of
 * the active cell must be, so that keyboard navigation can find it in the DOM
 * to scroll it into view.
 *
 * Returns the same Set instance while the membership doesn't change, so rows
 * don't re-render on every horizontal scroll event.
 */
export default class ColumnWindow {
  private current: ReadonlySet<string> | undefined;

  get(
    columns: Map<string, ColumnPosition>,
    scrollLeft: number,
    viewportWidth: number,
    alwaysInclude: string | undefined,
  ): ReadonlySet<string> | undefined {
    if (viewportWidth <= 0) return undefined; // not measured yet: render all
    const margin = viewportWidth / 2;
    const from = scrollLeft - margin;
    const to = scrollLeft + viewportWidth + margin;
    const ids = new Set<string>();
    for (const [id, { left, width }] of columns) {
      if ((left + width > from && left < to) || id === alwaysInclude) {
        ids.add(id);
      }
    }
    const { current } = this;
    if (
      current &&
      current.size === ids.size &&
      [...ids].every((id) => current.has(id))
    ) {
      return current;
    }
    this.current = ids;
    return ids;
  }
}
