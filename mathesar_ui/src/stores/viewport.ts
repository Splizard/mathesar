import { type Readable, derived, readable } from 'svelte/store';

/**
 * How wide the window has to be before a table gets the full treatment.
 *
 * A phone held either way is under this, and so is a narrow window on a desktop, which is the
 * point: what matters is the room there is rather than what kind of machine it is.
 */
export const compactWidth = 820;

/** Which of the three ways a table can be laid out suits the room there is */
export type TableLayout =
  /** The spreadsheet, with the panes above and below it */
  | 'sheet'
  /** The spreadsheet and nothing else, the panes being more than the screen can spare */
  | 'compactSheet'
  /** A list of records to pick one from, a spreadsheet being unreadable this narrow */
  | 'recordList';

/**
 * Which layout a table should have.
 *
 * Turning a phone on its side is the way to ask for the spreadsheet, and holding it upright is
 * the way to ask for something that can be read a record at a time. There is nothing to set: the
 * way the device is being held says which is wanted.
 */
export function chooseTableLayout(room: {
  width: number;
  isPortrait: boolean;
}): TableLayout {
  if (room.width > compactWidth) return 'sheet';
  return room.isPortrait ? 'recordList' : 'compactSheet';
}

/** Asked for only where there is a window that can answer, so that this loads anywhere */
function mediaQuery(query: string): MediaQueryList | undefined {
  if (typeof window === 'undefined') return undefined;
  if (typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia(query);
}

function fromMediaQuery(query: string): Readable<boolean> {
  return readable(mediaQuery(query)?.matches ?? false, (set) => {
    const media = mediaQuery(query);
    if (!media) return undefined;
    const update = () => set(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
}

export const windowWidth = readable(
  typeof window === 'undefined' ? compactWidth + 1 : window.innerWidth,
  (set) => {
    if (typeof window === 'undefined') return undefined;
    const update = () => set(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  },
);

/**
 * Whether the window is taller than it is wide.
 *
 * Asked of the browser rather than worked out from the width and height, so that it answers the
 * same thing the CSS would.
 */
export const isPortrait = fromMediaQuery('(orientation: portrait)');

export const tableLayout: Readable<TableLayout> = derived(
  [windowWidth, isPortrait],
  ([width, portrait]) => chooseTableLayout({ width, isPortrait: portrait }),
);
