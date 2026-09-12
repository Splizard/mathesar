import {
  type IntervalParts,
  formatIntervalParts,
  getFilledParts,
  parseIntervalParts,
} from './intervalParts';

/**
 * The units a duration can be given as an amount of. Years and months are of
 * PostgreSQL's months, weeks and days of its days, and the rest of its time of
 * day; a duration is only ever read as an amount of a unit of the one part it
 * fills, since the parts aren't the same length as each other.
 */
export const allAmountUnits = [
  'y',
  'mon',
  'w',
  'd',
  'h',
  'm',
  's',
  'ms',
] as const;

export type AmountUnit = (typeof allAmountUnits)[number];

const unitSizes: Record<
  AmountUnit,
  { part: keyof IntervalParts; size: number }
> = {
  y: { part: 'months', size: 12 },
  mon: { part: 'months', size: 1 },
  w: { part: 'days', size: 7 },
  d: { part: 'days', size: 1 },
  h: { part: 'milliseconds', size: 3600000 },
  m: { part: 'milliseconds', size: 60000 },
  s: { part: 'milliseconds', size: 1000 },
  ms: { part: 'milliseconds', size: 1 },
};

export interface DurationAmount {
  /** The amount, or undefined where the duration isn't an amount of one unit */
  amount?: string;
  unit: AmountUnit;
}

/**
 * A duration as an amount of one of its units: the largest unit of the part it
 * fills that it's a whole number of, so that an hour reads as one hour rather
 * than sixty minutes, and a fortnight as two weeks.
 *
 * A duration filling more than one part, such as a month and a half of days,
 * is no single amount, and is given none.
 */
export function readDurationAmount(
  duration: string | null | undefined,
  defaultUnit: AmountUnit = 'm',
): DurationAmount {
  const parts = parseIntervalParts(duration);
  if (!parts) return { amount: undefined, unit: defaultUnit };
  const filled = getFilledParts(parts);
  if (filled.length === 0) return { amount: '0', unit: defaultUnit };
  if (filled.length > 1) return { amount: undefined, unit: defaultUnit };
  const [part] = filled;
  const unitsOfPart = allAmountUnits.filter((u) => unitSizes[u].part === part);
  const unit =
    unitsOfPart.find((u) => parts[part] % unitSizes[u].size === 0) ??
    unitsOfPart[unitsOfPart.length - 1];
  return { amount: String(parts[part] / unitSizes[unit].size), unit };
}

/** The duration of that many of the unit, as PostgreSQL takes it */
export function writeDurationAmount(
  amount: string | number | null | undefined,
  unit: AmountUnit,
): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Number(amount);
  if (Number.isNaN(value)) return null;
  const { part, size } = unitSizes[unit];
  const parts: IntervalParts = { months: 0, days: 0, milliseconds: 0 };
  parts[part] = value * size;
  return formatIntervalParts(parts);
}
