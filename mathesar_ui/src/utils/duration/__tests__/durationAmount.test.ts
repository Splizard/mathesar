import { readDurationAmount, writeDurationAmount } from '../durationAmount';
import DurationFormatter from '../DurationFormatter';
import DurationSpecification from '../DurationSpecification';

describe('durations as an amount of a unit', () => {
  test('are read in the largest unit of the part they fill', () => {
    // The time of day
    expect(readDurationAmount('P0Y0M0DT1H30M0S')).toEqual({
      amount: '90',
      unit: 'm',
    });
    expect(readDurationAmount('P0Y0M0DT2H0M0S')).toEqual({
      amount: '2',
      unit: 'h',
    });
    expect(readDurationAmount('P0Y0M0DT0H0M30S')).toEqual({
      amount: '30',
      unit: 's',
    });
    // Days, which PostgreSQL keeps apart from the time of day
    expect(readDurationAmount('P0Y0M3DT0H0M0S')).toEqual({
      amount: '3',
      unit: 'd',
    });
    expect(readDurationAmount('P0Y0M14DT0H0M0S')).toEqual({
      amount: '2',
      unit: 'w',
    });
    // Months, which it keeps apart from days
    expect(readDurationAmount('P0Y1M0DT0H0M0S')).toEqual({
      amount: '1',
      unit: 'mon',
    });
    expect(readDurationAmount('P0Y15M0DT0H0M0S')).toEqual({
      amount: '15',
      unit: 'mon',
    });
    expect(readDurationAmount('P1Y0M0DT0H0M0S')).toEqual({
      amount: '1',
      unit: 'y',
    });
    expect(readDurationAmount('P2Y0M0DT0H0M0S')).toEqual({
      amount: '2',
      unit: 'y',
    });
    expect(readDurationAmount('P1Y6M0DT0H0M0S')).toEqual({
      amount: '18',
      unit: 'mon',
    });
  });

  test('are no single amount when they fill more than one part', () => {
    // A month and a half of days isn't a number of months, nor of days
    expect(readDurationAmount('P0Y1M15DT0H0M0S')).toEqual({
      amount: undefined,
      unit: 'm',
    });
    expect(readDurationAmount('P0Y0M1DT2H0M0S')).toEqual({
      amount: undefined,
      unit: 'm',
    });
    expect(readDurationAmount('P0Y0M1DT2H0M0S', 'd')).toEqual({
      amount: undefined,
      unit: 'd',
    });
  });

  test('are read as nothing when there is no duration', () => {
    expect(readDurationAmount(null)).toEqual({ amount: undefined, unit: 'm' });
    expect(readDurationAmount('', 'h')).toEqual({
      amount: undefined,
      unit: 'h',
    });
    expect(readDurationAmount('P0Y0M0DT0H0M0S', 'h')).toEqual({
      amount: '0',
      unit: 'h',
    });
  });

  test('are written in the part of the unit they are of', () => {
    expect(writeDurationAmount('90', 'm')).toBe('PT5400S');
    expect(writeDurationAmount(2, 'h')).toBe('PT7200S');
    expect(writeDurationAmount('3', 'd')).toBe('P3D');
    expect(writeDurationAmount('2', 'w')).toBe('P14D');
    expect(writeDurationAmount('3', 'mon')).toBe('P3M');
    expect(writeDurationAmount('1', 'y')).toBe('P12M');
    expect(writeDurationAmount('1.5', 's')).toBe('PT1.5S');
    expect(writeDurationAmount('', 's')).toBe(null);
    expect(writeDurationAmount(null, 's')).toBe(null);
  });

  test('round-trip through the amount and its unit', () => {
    for (const duration of [
      'P0Y0M0DT1H30M0S',
      'P0Y0M3DT0H0M0S',
      'P0Y0M14DT0H0M0S',
      'P1Y0M0DT0H0M0S',
      'P0Y5M0DT0H0M0S',
    ]) {
      const { amount, unit } = readDurationAmount(duration);
      const written = writeDurationAmount(amount, unit);
      expect(readDurationAmount(written)).toEqual({ amount, unit });
    }
  });
});

describe('durations of months', () => {
  const specification = new DurationSpecification({ max: 'm', min: 's' });
  const formatter = new DurationFormatter(specification);

  test('are written out, no clock being able to show them', () => {
    expect(formatter.format('P0Y1M0DT0H0M0S')).toBe('1 month');
    expect(formatter.format('P0Y3M0DT0H0M0S')).toBe('3 months');
    expect(formatter.format('P1Y0M0DT0H0M0S')).toBe('1 year');
    expect(formatter.format('P1Y2M0DT0H0M0S')).toBe('1 year 2 months');
    expect(formatter.format('P0Y1M3DT0H0M0S')).toBe('1 month 3 days');
    expect(formatter.format('P0Y1M0DT1H30M0S')).toBe('1 month 90:00');
  });

  test('leave durations a clock can show as they were', () => {
    expect(formatter.format('P0Y0M0DT1H30M0S')).toBe('90:00');
    expect(formatter.format('P0Y0M3DT0H0M0S')).toBe('4320:00');
  });

  test('are read back from what was written', () => {
    expect(formatter.parse('3 months').value).toBe('P3M');
    expect(formatter.parse('1 year').value).toBe('P12M');
    expect(formatter.parse('1 year 2 months').value).toBe('P14M');
    expect(formatter.parse('1 month 3 days').value).toBe('P1M3D');
    // What isn't months is still read as a time on a clock
    expect(formatter.parse('90:00').value).toBe('PT90M');
  });
});
