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
import { parseIntervalParts } from './intervalParts';

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
function shiftAndFormatISODurationString(
  canonicalValue: string,
  specification: DurationSpecification,
): string {
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

  return dayjs
    .duration(unitsWithValues)
    .format(specification.getFormattingString());
}

/**
 * A duration of months written out, since a month isn't a number of days and
 * so can't be shown on a clock: "1 year 2 months", with any days of its own.
 */
function formatMonths(months: number, days: number): string {
  const translate = get(_);
  const years = Math.trunc(months / 12);
  const wholeMonths = months - years * 12;
  return [
    ...(years !== 0
      ? [translate('years_count', { values: { count: years } })]
      : []),
    ...(wholeMonths !== 0
      ? [translate('months_count', { values: { count: wholeMonths } })]
      : []),
    ...(days !== 0
      ? [translate('days_count', { values: { count: days } })]
      : []),
  ].join(' ');
}

/** The number of years, months and days written out, if that's what this is */
function parseMonths(userInput: string): string | null | undefined {
  const translate = get(_);
  const counts: Record<string, number> = {};
  let rest = userInput.trim();
  if (rest === '') return undefined;
  for (const [key, months] of [
    ['years_count', 12],
    ['months_count', 1],
    ['days_count', 0],
  ] as const) {
    for (const count of [1, 2]) {
      // The written form of one and of many, to read back what we wrote
      const written = translate(key, { values: { count } });
      const number = written.replace(String(count), '(-?[\\d.]+)');
      const match = new RegExp(`(?:^|\\s)${number}(?:\\s|$)`).exec(rest);
      if (match) {
        counts[key] = Number(match[1]) * (months || 1);
        if (key === 'days_count') counts.days = Number(match[1]);
        rest = rest.replace(match[0], ' ').trim();
        break;
      }
    }
  }
  if (rest !== '' || Object.keys(counts).length === 0) return undefined;
  const months = (counts.years_count ?? 0) + (counts.months_count ?? 0);
  const days = counts.days ?? 0;
  if (months === 0) return undefined;
  return `P${String(months)}M${days === 0 ? '' : `${String(days)}D`}`;
}

export default class DurationFormatter implements InputFormatter<string> {
  specification: DurationSpecification;

  constructor(specification: DurationSpecification) {
    this.specification = specification;
  }

  parse(userInput: string): ParseResult<string> {
    // A duration of months is written out, so can be typed back that way
    const months = parseMonths(userInput);
    if (months) {
      return { value: months, intermediateDisplay: userInput };
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
