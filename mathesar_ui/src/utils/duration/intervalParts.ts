/**
 * @file
 * The parts of an interval, which PostgreSQL keeps in three: months, days,
 * and the time of day. It keeps them apart because they aren't the same length
 * as each other — a month is as long as the month it's added to, and a day is
 * 23 or 25 hours where the clocks change — so a duration of months can't be
 * given exactly in days, nor one of days in hours.
 *
 * Values reach us as the ISO 8601 duration PostgreSQL writes, such as
 * `P0Y1M0DT1H30M0S`, with years and months given separately from days.
 */

export interface IntervalParts {
  /** Years and months together, as PostgreSQL holds them */
  months: number;
  /** Weeks and days together, as PostgreSQL holds them */
  days: number;
  /** Hours, minutes and seconds together, as PostgreSQL holds them */
  milliseconds: number;
}

const isoPattern =
  /^(-?)P(?:(-?[\d.]+)Y)?(?:(-?[\d.]+)M)?(?:(-?[\d.]+)W)?(?:(-?[\d.]+)D)?(?:T(?:(-?[\d.]+)H)?(?:(-?[\d.]+)M)?(?:(-?[\d.]+)S)?)?$/;

/** The parts of an interval written as an ISO 8601 duration, if it is one */
export function parseIntervalParts(
  duration: string | null | undefined,
): IntervalParts | undefined {
  if (!duration) return undefined;
  const match = isoPattern.exec(duration.trim());
  if (!match) return undefined;
  const [, sign, years, months, weeks, days, hours, minutes, seconds] = match;
  const number = (part: string | undefined) => (part ? Number(part) : 0);
  if ([years, months, weeks, days, hours, minutes, seconds].every((p) => !p)) {
    return undefined;
  }
  const scale = sign === '-' ? -1 : 1;
  return {
    months: scale * (number(years) * 12 + number(months)),
    days: scale * (number(weeks) * 7 + number(days)),
    milliseconds:
      scale *
      (number(hours) * 3600000 +
        number(minutes) * 60000 +
        number(seconds) * 1000),
  };
}

/** An interval's parts as the ISO 8601 duration PostgreSQL takes */
export function formatIntervalParts(parts: IntervalParts): string {
  const { months, days, milliseconds } = parts;
  const seconds = milliseconds / 1000;
  const time = seconds === 0 ? '' : `T${String(seconds)}S`;
  if (months === 0 && days === 0 && time === '') return 'PT0S';
  return `P${months === 0 ? '' : `${String(months)}M`}${
    days === 0 ? '' : `${String(days)}D`
  }${time}`;
}

/** Whether an interval is only of months, only of days, or only of time */
export function getFilledParts(parts: IntervalParts): (keyof IntervalParts)[] {
  return (['months', 'days', 'milliseconds'] as const).filter(
    (part) => parts[part] !== 0,
  );
}
