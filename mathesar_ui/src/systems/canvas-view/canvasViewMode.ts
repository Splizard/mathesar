import LocalStorageStore from '@mathesar/stores/LocalStorageStore';

/**
 * Whether a table's shapes are drawn on a canvas rather than listed in the sheet.
 *
 * Only offered for a table that holds shapes at all, and the sheet is what a table opens as, so
 * this is off until it is asked for. Remembered once it is: somebody looking at shapes is usually
 * looking at more than one table of them.
 */
export const shapesOnCanvas = new LocalStorageStore<boolean>({
  key: 'shapes-on-canvas',
  defaultValue: false,
});
