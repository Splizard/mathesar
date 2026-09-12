import { type Readable, derived, readable } from 'svelte/store';

/**
 * How wide the window has to be before a table gets the full treatment.
 *
 * A phone held either way is under this, and so is a narrow window on a desktop, which is the
 * point: what matters is the room there is rather than what kind of machine it is.
 */
export const compactWidth = 820;

/**
 * How tall the window has to be before a table gets the full treatment.
 *
 * The panes above and below a table cost about a fifth of a phone's landscape screen and nothing
 * of a desktop's, so a window can be wide enough for them and still not have the room. A big
 * phone on its side is wide -- wider than some laptops -- and 400-odd pixels tall, which is where
 * the panes are worth the least and cost the most.
 */
export const compactHeight = 560;

/** Which of the three ways a table can be laid out suits the room there is */
export type TableLayout =
  /** The spreadsheet, with the panes above and below it */
  | 'sheet'
  /** The spreadsheet and one slim row of controls, the panes being more than the screen can spare */
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
  height: number;
  isPortrait: boolean;
}): TableLayout {
  if (room.width > compactWidth && room.height > compactHeight) return 'sheet';
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

/** How big the window is, watched together so that a turned phone is one change rather than two */
function windowSize(read: () => number, fallback: number): Readable<number> {
  return readable(typeof window === 'undefined' ? fallback : read(), (set) => {
    if (typeof window === 'undefined') return undefined;
    const update = () => set(read());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });
}

export const windowWidth = windowSize(
  () => window.innerWidth,
  compactWidth + 1,
);

export const windowHeight = windowSize(
  () => window.innerHeight,
  compactHeight + 1,
);

/**
 * Whether the window is taller than it is wide.
 *
 * Asked of the browser rather than worked out from the width and height, so that it answers the
 * same thing the CSS would.
 */
export const isPortrait = fromMediaQuery('(orientation: portrait)');

/**
 * Whether the way around is shown the way a phone shows it.
 *
 * A breadcrumb is a row of names with the room to read them, which a phone held upright does not
 * have. Below this the page keeps its name and its logo and puts the trail behind a button.
 */
export const navigationIsCompact: Readable<boolean> = derived(
  [windowWidth, isPortrait],
  ([width, portrait]) => portrait && width <= compactWidth,
);

export const tableLayout: Readable<TableLayout> = derived(
  [windowWidth, windowHeight, isPortrait],
  ([width, height, portrait]) =>
    chooseTableLayout({ width, height, isPortrait: portrait }),
);
