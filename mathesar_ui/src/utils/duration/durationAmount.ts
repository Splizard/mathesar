import type { DurationUnit } from '@mathesar/api/rpc/_common/columnDisplayOptions';
import { dayjs } from '@mathesar-component-library';

export const millisecondsIn: Record<DurationUnit, number> = {
  d: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000,
  ms: 1,
};

/**
 * A duration as an amount of one of the given units: the largest it's a whole
 * number of, so that an hour reads as one hour rather than sixty minutes, and
 * the smallest of them otherwise.
 */
export function readDurationAmount(
  duration: string | null | undefined,
  unitsInRange: DurationUnit[],
): { amount?: string; unit: DurationUnit } {
  const smallest = unitsInRange[unitsInRange.length - 1] ?? 's';
  if (duration === null || duration === undefined || duration === '') {
    return { amount: undefined, unit: smallest };
  }
  const milliseconds = dayjs.duration(duration).asMilliseconds();
  const wholeUnit =
    unitsInRange.find(
      (unit) => milliseconds !== 0 && milliseconds % millisecondsIn[unit] === 0,
    ) ?? smallest;
  return {
    amount: String(milliseconds / millisecondsIn[wholeUnit]),
    unit: wholeUnit,
  };
}

/** The duration of that many of the unit, as PostgreSQL takes it */
export function writeDurationAmount(
  amount: string | number | null | undefined,
  unit: DurationUnit,
): string | null {
  if (amount === null || amount === undefined || amount === '') return null;
  const milliseconds = Number(amount) * millisecondsIn[unit];
  if (Number.isNaN(milliseconds)) return null;
  return dayjs.duration(milliseconds, 'milliseconds').toISOString();
}
