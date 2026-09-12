/**
 * @file
 * The bounds of a range, read from and written as the text PostgreSQL gives
 * for one, so that a column of ranges can be edited a bound at a time.
 *
 * A range is written as its bounds between brackets, square where the bound is
 * one of the range's own values and round where it isn't: `[1,10)` holds every
 * number from 1 up to but not including 10. A bound left out is unbounded, as
 * in `[1,)`, and a range holding nothing at all is written `empty`.
 *
 * A multirange is any number of ranges that don't overlap, written between
 * braces: `{[1,3),[10,20)}`.
 */

export interface RangeValue {
  /** The lower bound, or undefined where the range is unbounded below */
  lower?: string;
  /** The upper bound, or undefined where the range is unbounded above */
  upper?: string;
  /** Whether the lower bound is one of the range's values */
  lowerInclusive: boolean;
  /** Whether the upper bound is one of the range's values */
  upperInclusive: boolean;
  /** Whether the range holds nothing, which no bounds can say */
  isEmpty: boolean;
}

export const emptyRange: RangeValue = {
  lowerInclusive: true,
  upperInclusive: false,
  isEmpty: true,
};

export const unboundedRange: RangeValue = {
  lowerInclusive: true,
  upperInclusive: false,
  isEmpty: false,
};

/** Reads one bound, which PostgreSQL quotes when it holds anything awkward */
function readBound(
  text: string,
  start: number,
): { bound?: string; end: number } | undefined {
  if (text[start] === '"') {
    let bound = '';
    let i = start + 1;
    while (i < text.length) {
      if (text[i] === '\\') {
        bound += text[i + 1] ?? '';
        i += 2;
      } else if (text[i] === '"') {
        // Two quotes within quotes stand for one
        if (text[i + 1] === '"') {
          bound += '"';
          i += 2;
        } else {
          return { bound, end: i + 1 };
        }
      } else {
        bound += text[i];
        i += 1;
      }
    }
    return undefined;
  }
  let end = start;
  while (end < text.length && text[end] !== ',' && !')]'.includes(text[end])) {
    end += 1;
  }
  const bound = text.slice(start, end);
  return { bound: bound === '' ? undefined : bound, end };
}

/** The bounds of a range written as PostgreSQL writes it, if it is one */
export function parseRange(text: string): RangeValue | undefined {
  const trimmed = text.trim();
  if (trimmed.toLowerCase() === 'empty') return emptyRange;
  const lowerInclusive = trimmed[0] === '[';
  if (!lowerInclusive && trimmed[0] !== '(') return undefined;
  const lower = readBound(trimmed, 1);
  if (!lower || trimmed[lower.end] !== ',') return undefined;
  const upper = readBound(trimmed, lower.end + 1);
  if (!upper || upper.end !== trimmed.length - 1) return undefined;
  const upperInclusive = trimmed[upper.end] === ']';
  if (!upperInclusive && trimmed[upper.end] !== ')') return undefined;
  return {
    lower: lower.bound,
    upper: upper.bound,
    lowerInclusive,
    upperInclusive,
    isEmpty: false,
  };
}

const needsQuoting = (bound: string) =>
  bound === '' ||
  bound.toLowerCase() === 'empty' ||
  /[,"\\()[\]{}]/.test(bound) ||
  bound.trim() !== bound;

function writeBound(bound: string | undefined): string {
  if (bound === undefined) return '';
  if (!needsQuoting(bound)) return bound;
  return `"${bound.replace(/(["\\])/g, '\\$1')}"`;
}

/** A range as PostgreSQL takes it, which is how a column's value is written */
export function formatRange(range: RangeValue): string {
  if (range.isEmpty) return 'empty';
  return [
    range.lowerInclusive ? '[' : '(',
    writeBound(range.lower),
    ',',
    writeBound(range.upper),
    range.upperInclusive ? ']' : ')',
  ].join('');
}

/** The ranges of a multirange written as PostgreSQL writes it, if it is one */
export function parseMultirange(text: string): RangeValue[] | undefined {
  const trimmed = text.trim();
  if (trimmed[0] !== '{' || trimmed[trimmed.length - 1] !== '}') {
    return undefined;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner === '') return [];
  const texts: string[] = [];
  let start = 0;
  let depth = 0;
  let isQuoted = false;
  for (let i = 0; i < inner.length; i += 1) {
    const character = inner[i];
    if (isQuoted) {
      if (character === '\\') i += 1;
      else if (character === '"') isQuoted = false;
    } else if (character === '"') {
      isQuoted = true;
    } else if ('[('.includes(character)) {
      depth += 1;
    } else if ('])'.includes(character)) {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      texts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  texts.push(inner.slice(start));
  const parsed = texts.map((text_) => parseRange(text_));
  return parsed.every((range): range is RangeValue => !!range)
    ? parsed
    : undefined;
}

/** A multirange as PostgreSQL takes it, without the ranges holding nothing */
export function formatMultirange(ranges: RangeValue[]): string {
  const held = ranges.filter((range) => !range.isEmpty);
  return `{${held.map(formatRange).join(',')}}`;
}
