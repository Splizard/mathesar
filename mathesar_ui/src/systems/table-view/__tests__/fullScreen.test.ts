import { get } from 'svelte/store';

import { tableIsFullScreen } from '../fullScreen';

/** Say what the browser would say about whether it is showing something full screen */
function browserSaysFullScreen(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    value: element,
  });
  document.dispatchEvent(new Event('fullscreenchange'));
}

describe('showing a table on its own', () => {
  test('lets go when the browser leaves full screen without being asked', () => {
    // Subscribed, because that is when the store starts listening.
    const stop = tableIsFullScreen.subscribe(() => {});
    tableIsFullScreen.set(true);

    browserSaysFullScreen(document.documentElement);
    expect(get(tableIsFullScreen)).toBe(true);

    browserSaysFullScreen(null);
    expect(get(tableIsFullScreen)).toBe(false);

    stop();
  });

  test('hears nothing once nobody is watching', () => {
    const stop = tableIsFullScreen.subscribe(() => {});
    stop();
    tableIsFullScreen.set(true);

    browserSaysFullScreen(null);
    expect(get(tableIsFullScreen)).toBe(true);

    tableIsFullScreen.set(false);
  });
});
