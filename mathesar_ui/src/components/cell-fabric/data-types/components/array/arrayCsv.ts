/**
 * Arrays are shown and edited as their values separated by a delimiter, a comma
 * by default, which a backslash escapes within a value, as it does a backslash.
 * A value written as `\N` is NULL, so the text `\N` is written `\\N`.
 */

const NULL_VALUE = '\\N';

function escapeValue(value: string, delimiter: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replaceAll(delimiter, `\\${delimiter}`);
  // The text `\N` would otherwise read as NULL
  return escaped === NULL_VALUE ? `\\${escaped}` : escaped;
}

/**
 * The text of an array's values, each shown by the given function.
 */
export function formatArray(
  values: unknown[],
  delimiter: string,
  formatValue: (value: unknown) => string = String,
): string {
  return values
    .map((value) =>
      value === null || value === undefined
        ? NULL_VALUE
        : escapeValue(formatValue(value), delimiter),
    )
    .join(delimiter);
}

/**
 * The values of an array written as text, each as its text or NULL. Empty text
 * has no values.
 */
export function parseArray(text: string, delimiter: string): (string | null)[] {
  if (text === '') return [];
  const values: (string | null)[] = [];
  let value = '';
  /** The value as it's written, which says whether it's NULL or the text of it */
  let raw = '';
  let isEscaped = false;
  const endValue = () => {
    values.push(raw === NULL_VALUE ? null : value);
    value = '';
    raw = '';
  };
  for (const character of text) {
    raw += character;
    if (isEscaped) {
      value += character;
      isEscaped = false;
    } else if (character === '\\') {
      isEscaped = true;
    } else if (character === delimiter) {
      raw = raw.slice(0, -1);
      endValue();
    } else {
      value += character;
    }
  }
  // A trailing backslash escapes nothing, so is itself
  if (isEscaped) value += '\\';
  endValue();
  return values;
}
