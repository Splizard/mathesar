/**
 * This is raw UI text which should not be translated. It's stored here for the
 * following reasons:
 *
 * - It makes it explicit that this text should not be translated.
 * - It won't raise linting errors for untranslated text.
 */
export const staticText = {
  LOGIN: 'LOGIN',
  COLON: ':',
  EN_DASH: '–',
  /**
   * The upstream project, its Foundation and its documentation, which keep
   * their name wherever the text is really about them.
   */
  MATHESAR: 'Mathesar',
  /** What this build of it calls itself, everywhere it speaks of itself. */
  PRODUCT_NAME: 'Hidden Strings',
} as const;
