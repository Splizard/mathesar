/**
 * Showing a table on its own.
 *
 * Two things at once, which is why they are here together rather than at either of the places
 * that does them. Everything around the table -- the breadcrumb above it and the row of controls
 * under that -- is taken away, which is ours to do; and the browser is asked for the whole screen,
 * which is its to give and which it may refuse or not offer at all. Taking the rest of the page
 * away is most of what was wanted, so it happens either way.
 */
import { writable } from 'svelte/store';

/**
 * Whether the table is being shown on its own.
 *
 * It lets go when the browser leaves full screen without being asked to -- Escape, a back
 * gesture, a tab switched away from -- so that the page does not stay stripped down with nothing
 * to show for it.
 */
export const tableIsFullScreen = writable(false, (set) => {
  if (typeof document === 'undefined') return undefined;
  const sync = () => {
    if (!document.fullscreenElement) set(false);
  };
  document.addEventListener('fullscreenchange', sync);
  return () => document.removeEventListener('fullscreenchange', sync);
});

/** Ask the browser for the whole screen, and settle for the whole page if it says no */
export async function showOnlyTheTable(): Promise<void> {
  tableIsFullScreen.set(true);
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // Refused, or never offered: an iPhone has no full screen for anything but a video. The rest
    // of the page is already out of the way, which is the part we can do ourselves.
  }
}

/** Put the page back the way it was */
export async function showTheRestAgain(): Promise<void> {
  tableIsFullScreen.set(false);
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Already gone, which is where we were trying to get to.
  }
}
