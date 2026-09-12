import type { Duration, DurationUnitType } from 'dayjs/plugin/duration';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

import type { DurationUnit } from '@mathesar/api/rpc/_common/columnDisplayOptions';
import { dayjs } from '@mathesar-component-library';
import type {
  InputFormatter,
  ParseResult,
} from '@mathesar-component-library/types';

import type DurationSpecification from './DurationSpecification';
import {
  type IntervalParts,
  formatIntervalParts,
  parseIntervalParts,
} from './intervalParts';

const FLOAT_REGEX = /^((\.?\d+)|(\d+(\.\d+)?))$/;

function parseRawDurationStringToISOString(
  specification: DurationSpecification,
  userInput: string,
): string | null {
  let unitsInRange = specification.getUnitsInRange();
  if (unitsInRange[unitsInRange.length - 1] === 'ms') {
    unitsInRange = unitsInRange.slice(0, unitsInRange.length - 1);
  }

  let cleanedInput = userInput.trim();
  if (cleanedInput === '') {
    return null;
  }

  const firstEntry = cleanedInput[0];
  if (firstEntry === ':') {
    cleanedInput = `0${cleanedInput}`;
  }

  const lastEntry = cleanedInput[cleanedInput.length - 1];
  if (lastEntry === ':' || lastEntry === '.') {
    cleanedInput = `${cleanedInput}0`;
  }

  const unitValues = cleanedInput.split(':');
  if (unitValues.length > unitsInRange.length) {
    throw new Error('Duration exceeds specified unit range');
  }

  const terms = cleanedInput
    .split(':')
    .map((entry) => {
      let valueString = entry;
      if (
        valueString.length > 1 &&
        valueString[valueString.length - 1] === '.'
      ) {
        valueString = `${valueString}0`;
      }
      const value = parseFloat(valueString);
      // We are additionally testing with a regex because
      // parseFloat("12.12string") will return 12.12, which is valid
      // Since we have to direcly pass the input string as intermediateDisplay,
      // we will have to throw a parsing error here for such cases.
      if (Number.isNaN(value) || !FLOAT_REGEX.test(valueString)) {
        throw new Error('Unable to parse duration');
      }
      return value;
    })
    .slice(-unitsInRange.length);

  const slicedUnits = unitsInRange.slice(-terms.length);

  const unitWithValue: Partial<Record<DurationUnit, number>> = {};
  slicedUnits.forEach((unit, index) => {
    unitWithValue[unit] = terms[index] ?? 0;
  });

  return dayjs
    .duration({
      years: 0,
      months: 0,
      days: unitWithValue.d ?? 0,
      hours: unitWithValue.h ?? 0,
      minutes: unitWithValue.m ?? 0,
      seconds: unitWithValue.s ?? 0,
    })
    .toISOString();
}

const unitConfig: Record<
  DurationUnit,
  {
    convert: (duration: Duration) => number;
    unitName: DurationUnitType;
    decimalCorrection?: number;
  }
> = {
  ms: {
    convert: (duration: Duration) => duration.asMilliseconds(),
    unitName: 'milliseconds',
    decimalCorrection: 0,
  },
  s: {
    convert: (duration: Duration) => duration.asSeconds(),
    unitName: 'seconds',
  },
  m: {
    convert: (duration: Duration) => duration.asMinutes(),
    unitName: 'minutes',
  },
  h: {
    convert: (duration: Duration) => duration.asHours(),
    unitName: 'hours',
  },
  d: {
    convert: (duration: Duration) => duration.asDays(),
    unitName: 'days',
  },
};

// DISCUSS: What's best for Mathesar?
// Duration accuracy or user friendliness?
// Should 1H80M80S be displayed as is, or transform to 2H21M20S?
function shiftIntoUnits(
  canonicalValue: string,
  specification: DurationSpecification,
): Partial<Record<DurationUnitType, number>> {
  const unitsWithValues: Partial<Record<DurationUnitType, number>> = {};
  const duration = dayjs.duration(canonicalValue);

  const units = specification.getUnitsInRange().reverse();

  if (units.length === 0) {
    // This should never happen;
    throw new Error('Invalid duration specification');
  }

  let currentUnitConfig = unitConfig[units[0]];
  let currentUnitValue = currentUnitConfig.convert(duration);

  for (const unit of units) {
    const higherUnit = specification.getHigherUnit(unit);
    let higherUnitValue = 0;
    if (higherUnit) {
      const higherUnitConfig = unitConfig[higherUnit];
      higherUnitValue = Math.floor(
        higherUnitConfig.convert(
          dayjs.duration(currentUnitValue, currentUnitConfig.unitName),
        ),
      );
      currentUnitValue -= currentUnitConfig.convert(
        dayjs.duration(higherUnitValue, higherUnitConfig.unitName),
      );
    }
    unitsWithValues[currentUnitConfig.unitName] = parseFloat(
      currentUnitValue.toFixed(currentUnitConfig.decimalCorrection ?? 3),
    );
    if (higherUnit) {
      currentUnitValue = higherUnitValue;
      currentUnitConfig = unitConfig[higherUnit];
    }
  }

  return unitsWithValues;
}

function shiftAndFormatISODurationString(
  canonicalValue: string,
  specification: DurationSpecification,
): string {
  return dayjs
    .duration(shiftIntoUnits(canonicalValue, specification))
    .format(specification.getFormattingString());
}

/** How each unit is written out, and what a duration of one comes to */
const writtenUnits = [
  { key: 'years_count', part: 'months', size: 12 },
  { key: 'months_count', part: 'months', size: 1 },
  { key: 'weeks_count', part: 'days', size: 7 },
  { key: 'days_count', part: 'days', size: 1 },
  { key: 'hours_count', part: 'milliseconds', size: 3600000 },
  { key: 'minutes_count', part: 'milliseconds', size: 60000 },
  { key: 'seconds_count', part: 'milliseconds', size: 1000 },
  { key: 'milliseconds_count', part: 'milliseconds', size: 1 },
] as const;

const writtenUnitOfDurationUnit: Record<DurationUnit, string> = {
  d: 'days_count',
  h: 'hours_count',
  m: 'minutes_count',
  s: 'seconds_count',
  ms: 'milliseconds_count',
};

/** A count of a unit as it's written out, such as "10 seconds" */
function writeCount(key: string, count: number): string {
  return get(_)(key, { values: { count } });
}

/**
 * A duration of months written out, since a month isn't a number of days and
 * so can't be shown on a clock: "1 year 2 months", with any days of its own.
 */
function formatMonths(months: number, days: number): string {
  const years = Math.trunc(months / 12);
  const wholeMonths = months - years * 12;
  return [
    ...(years !== 0 ? [writeCount('years_count', years)] : []),
    ...(wholeMonths !== 0 ? [writeCount('months_count', wholeMonths)] : []),
    ...(days !== 0 ? [writeCount('days_count', days)] : []),
  ].join(' ');
}

/**
 * A duration written out in the units the column shows it in, leaving out
 * those it holds none of: "10 seconds", "1 hour 30 minutes".
 */
function formatInWords(
  canonicalValue: string,
  specification: DurationSpecification,
): string {
  const parts = parseIntervalParts(canonicalValue);
  const months = parts?.months ?? 0;
  const unitsWithValues = shiftIntoUnits(
    months === 0
      ? canonicalValue
      : // The months are written out on their own, being no number of days
        `P${String(parts?.days ?? 0)}DT${String(
          (parts?.milliseconds ?? 0) / 1000,
        )}S`,
    specification,
  );
  const written = specification
    .getUnitsInRange()
    .map((unit) => ({
      key: writtenUnitOfDurationUnit[unit],
      count: unitsWithValues[unitConfig[unit].unitName] ?? 0,
    }))
    .filter(({ count }) => count !== 0)
    .map(({ key, count }) => writeCount(key, count));
  if (months !== 0) {
    written.unshift(formatMonths(months, 0));
  }
  // A duration of nothing is still of the smallest unit it's shown in
  if (written.length === 0) {
    const units = specification.getUnitsInRange();
    return writeCount(writtenUnitOfDurationUnit[units[units.length - 1]], 0);
  }
  return written.join(' ');
}

/** The duration written out in that text, if that's what it is */
function parseWrittenOut(userInput: string): string | undefined {
  const translate = get(_);
  let rest = userInput.trim();
  if (rest === '') return undefined;
  // The parts are kept apart, a day not being a number of hours to PostgreSQL
  const parts: IntervalParts = { months: 0, days: 0, milliseconds: 0 };
  let found = false;
  for (const unit of writtenUnits) {
    for (const count of [1, 2]) {
      // The written form of one and of many, to read back what we wrote
      const written = translate(unit.key, { values: { count } });
      const number = written.replace(String(count), String.raw`(-?[\d.]+)`);
      const match = new RegExp(String.raw`(?:^|\s)${number}(?:\s|$)`).exec(
        rest,
      );
      if (match) {
        parts[unit.part] += Number(match[1]) * unit.size;
        rest = rest.replace(match[0], ' ').trim();
        found = true;
        break;
      }
    }
  }
  if (rest !== '' || !found) return undefined;
  return formatIntervalParts(parts);
}

export default class DurationFormatter implements InputFormatter<string> {
  specification: DurationSpecification;

  constructor(specification: DurationSpecification) {
    this.specification = specification;
  }

  parse(userInput: string): ParseResult<string> {
    // A duration written out, whether by the column's format or because it's
    // of months, is read back from the same words
    const writtenOut = parseWrittenOut(userInput);
    if (writtenOut) {
      return { value: writtenOut, intermediateDisplay: userInput };
    }
    if (this.specification.isWrittenOut()) {
      // Half-written words aren't a duration yet, but aren't a mistake either
      return { value: null, intermediateDisplay: userInput };
    }
    const value = parseRawDurationStringToISOString(
      this.specification,
      userInput,
    );
    return {
      value,
      intermediateDisplay: userInput,
    };
  }

  format(canonicalValue: string): string {
    if (this.specification.isWrittenOut()) {
      return formatInWords(canonicalValue, this.specification);
    }
    const parts = parseIntervalParts(canonicalValue);
    // Months are as long as the month they're in, so no clock can show them
    if (parts && parts.months !== 0) {
      const written = formatMonths(parts.months, parts.days);
      if (parts.milliseconds === 0) return written;
      return `${written} ${shiftAndFormatISODurationString(
        `PT${String(parts.milliseconds / 1000)}S`,
        this.specification,
      )}`;
    }
    return shiftAndFormatISODurationString(canonicalValue, this.specification);
  }
}
