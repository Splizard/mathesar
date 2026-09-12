import { dayjs } from '@mathesar-component-library';
import type { ParseResult } from '@mathesar-component-library/types';

import DateTimeFormatter from './DateTimeFormatter';
import type DateTimeSpecification from './DateTimeSpecification';

export const unixTimeUnits = [
  'seconds',
  'milliseconds',
  'microseconds',
  'nanoseconds',
] as const;

/** The unit a whole number counts from the Unix epoch in */
export type UnixTimeUnit = (typeof unixTimeUnits)[number];

/** How many milliseconds one of the unit is */
const millisecondsPerUnit: Record<UnixTimeUnit, number> = {
  seconds: 1000,
  milliseconds: 1,
  microseconds: 1e-3,
  nanoseconds: 1e-6,
};

const wholeNumber = /^[+-]?\d+$/;

/**
 * Whether some text is a count rather than a date written out.
 *
 * Every date format Mathesar offers separates its parts with something — a
 * slash, a dash, a space — so a bare run of digits can only be the count
 * itself. That is what lets someone type a raw epoch value into the cell.
 */
export function isUnixTimeCount(text: string): boolean {
  return wholeNumber.test(text.trim());
}

/**
 * The instant a count of `unit` since the epoch names, in milliseconds.
 *
 * Returns undefined when the value isn't a whole number, which is how a value
 * Postgres would accept but we can't read (e.g. mid-edit input) stays visible
 * instead of being shown as a date in 1970.
 */
export function millisecondsFromUnixTime(
  value: string | number,
  unit: UnixTimeUnit,
): number | undefined {
  const text = String(value).trim();
  if (!wholeNumber.test(text)) return undefined;
  return Number(text) * millisecondsPerUnit[unit];
}

/**
 * A count of `unit` since the epoch, for an instant given in milliseconds.
 *
 * Written out with BigInt because a nanosecond count of a date in this century
 * is around 1.7e18, well past the largest integer a JS number holds exactly,
 * and a column of them deserves digits rather than 1.7576500001234568e+18.
 */
export function unixTimeFromMilliseconds(
  milliseconds: number,
  unit: UnixTimeUnit,
): string {
  if (unit === 'seconds') return String(Math.round(milliseconds / 1000));
  const wholeMilliseconds = BigInt(Math.round(milliseconds));
  switch (unit) {
    case 'milliseconds':
      return wholeMilliseconds.toString();
    case 'microseconds':
      return (wholeMilliseconds * BigInt(1e3)).toString();
    case 'nanoseconds':
    default:
      return (wholeMilliseconds * BigInt(1e6)).toString();
  }
}

/**
 * Reads and writes a whole number counting from the Unix epoch as a date and a
 * time, so that the date/time cell can show a number column without knowing
 * that is what it is doing.
 *
 * The value either side of this formatter is always the count, as the column
 * stores it. Only what the person sees is a date.
 */
export default class UnixTimeFormatter extends DateTimeFormatter {
  readonly unit: UnixTimeUnit;

  constructor(specification: DateTimeSpecification, unit: UnixTimeUnit) {
    super(specification);
    this.unit = unit;
  }

  parse(input: string): ParseResult<string> {
    const intermediateDisplay = String(input ?? '');
    const text = intermediateDisplay.trim();
    if (text === '') return { value: null, intermediateDisplay };
    if (isUnixTimeCount(text)) return { value: text, intermediateDisplay };

    // Whatever the date/time formatter makes of it, then back to a count. An
    // input it can't read comes back unchanged, and so fails to be a date here:
    // null, like any other number cell given something that isn't a number.
    const { value } = super.parse(text);
    const date =
      value === null
        ? undefined
        : dayjs(value, this.specification.getCanonicalFormattingStrings());
    if (!date?.isValid()) return { value: null, intermediateDisplay };
    return {
      value: unixTimeFromMilliseconds(date.valueOf(), this.unit),
      intermediateDisplay,
    };
  }

  format(value: string): string {
    const milliseconds = millisecondsFromUnixTime(value, this.unit);
    if (milliseconds === undefined) return String(value);
    return dayjs(milliseconds).format(this.specification.getFormattingString());
  }
}
