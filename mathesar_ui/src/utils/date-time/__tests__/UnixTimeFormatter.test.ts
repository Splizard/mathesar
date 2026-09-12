import DateTimeSpecification from '../DateTimeSpecification';
import UnixTimeFormatter, {
  type UnixTimeUnit,
  millisecondsFromUnixTime,
  unixTimeFromMilliseconds,
} from '../UnixTimeFormatter';

const spec = new DateTimeSpecification({
  type: 'timestamp',
  dateFormat: 'iso',
  timeFormat: '24hrLong',
});

function formatterFor(unit: UnixTimeUnit) {
  return new UnixTimeFormatter(spec, unit);
}

/** 2026-09-12 10:20:00 UTC, which is what every count below names */
const instant = Date.UTC(2026, 8, 12, 10, 20, 0);
const seconds = instant / 1000;

const counts: Record<UnixTimeUnit, string> = {
  seconds: `${seconds}`,
  milliseconds: `${seconds}000`,
  microseconds: `${seconds}000000`,
  nanoseconds: `${seconds}000000000`,
};

describe('reading a count as an instant', () => {
  test.each(Object.entries(counts))('%s', (unit, count) => {
    expect(millisecondsFromUnixTime(count, unit as UnixTimeUnit)).toBe(instant);
  });

  test('a value that is not a whole number is not a time', () => {
    expect(millisecondsFromUnixTime('', 'seconds')).toBeUndefined();
    expect(millisecondsFromUnixTime('12.5', 'seconds')).toBeUndefined();
    expect(millisecondsFromUnixTime('yesterday', 'seconds')).toBeUndefined();
  });

  test('a count before the epoch is negative', () => {
    expect(millisecondsFromUnixTime('-86400', 'seconds')).toBe(-86_400_000);
  });
});

describe('writing an instant as a count', () => {
  test.each(Object.entries(counts))('%s', (unit, count) => {
    expect(unixTimeFromMilliseconds(instant, unit as UnixTimeUnit)).toBe(count);
  });

  /**
   * The point of doing this in BigInt: a nanosecond count of a date in this
   * century is past the largest integer a JS number holds exactly, so plain
   * arithmetic gives "1.7892156e+18" or a number ending in the wrong digits.
   */
  test('a nanosecond count is written out in full, not in exponent notation', () => {
    const written = unixTimeFromMilliseconds(instant, 'nanoseconds');
    expect(written).toMatch(/^\d+$/);
    expect(written).toBe(`${seconds}000000000`);
  });
});

describe('the formatter', () => {
  test('shows a count as a date and a time', () => {
    expect(formatterFor('seconds').format(counts.seconds)).toBe(
      new Date(instant).toLocaleString('sv-SE').replace(',', ''),
    );
  });

  test('every unit shows the same instant', () => {
    const shown = Object.entries(counts).map(([unit, count]) =>
      formatterFor(unit as UnixTimeUnit).format(count),
    );
    expect(new Set(shown).size).toBe(1);
  });

  test('reads a date back as a count', () => {
    const formatter = formatterFor('milliseconds');
    const shown = formatter.format(counts.milliseconds);
    expect(formatter.parse(shown).value).toBe(counts.milliseconds);
  });

  test('a bare number typed in is the count itself', () => {
    expect(formatterFor('seconds').parse('  1789215600 ').value).toBe(
      '1789215600',
    );
  });

  test('an empty cell stays empty', () => {
    expect(formatterFor('seconds').parse('').value).toBeNull();
  });

  test('something that is neither a number nor a date is nothing', () => {
    expect(formatterFor('seconds').parse('wat').value).toBeNull();
  });

  test('a value it cannot read is shown as it is, not as 1970', () => {
    expect(formatterFor('seconds').format('not a number')).toBe('not a number');
  });

  test('what the person is typing is what they see', () => {
    expect(formatterFor('seconds').parse('2026-09').intermediateDisplay).toBe(
      '2026-09',
    );
  });
});
