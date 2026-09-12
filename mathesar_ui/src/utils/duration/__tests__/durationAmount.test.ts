import { readDurationAmount, writeDurationAmount } from '../durationAmount';

const units = ['d', 'h', 'm', 's'] as const;

describe('durations as an amount of a unit', () => {
  test('are read in the largest unit they are a whole number of', () => {
    expect(readDurationAmount('P0Y0M0DT1H30M0S', [...units])).toEqual({
      amount: '90',
      unit: 'm',
    });
    expect(readDurationAmount('P0Y0M0DT2H0M0S', [...units])).toEqual({
      amount: '2',
      unit: 'h',
    });
    expect(readDurationAmount('P0Y0M3DT0H0M0S', [...units])).toEqual({
      amount: '3',
      unit: 'd',
    });
    expect(readDurationAmount('P0Y0M0DT0H0M30S', [...units])).toEqual({
      amount: '30',
      unit: 's',
    });
    // The smallest unit allowed, even where the duration isn't whole in it
    expect(readDurationAmount('P0Y0M0DT0H0M0.5S', [...units])).toEqual({
      amount: '0.5',
      unit: 's',
    });
    expect(readDurationAmount('P0Y0M0DT1H30M0S', ['h', 'm'])).toEqual({
      amount: '90',
      unit: 'm',
    });
    expect(readDurationAmount('P0Y0M0DT1H30M0S', ['d', 'h'])).toEqual({
      amount: '1.5',
      unit: 'h',
    });
  });

  test('are read as nothing when there is no duration', () => {
    expect(readDurationAmount(null, [...units])).toEqual({
      amount: undefined,
      unit: 's',
    });
    expect(readDurationAmount('', ['d', 'h'])).toEqual({
      amount: undefined,
      unit: 'h',
    });
  });

  test('are written as the duration of that many of the unit', () => {
    expect(writeDurationAmount('90', 'm')).toBe('PT1H30M');
    expect(writeDurationAmount(2, 'h')).toBe('PT2H');
    expect(writeDurationAmount('3', 'd')).toBe('P3D');
    expect(writeDurationAmount('0.5', 's')).toBe('PT0.5S');
    expect(writeDurationAmount('', 's')).toBe(null);
    expect(writeDurationAmount(null, 's')).toBe(null);
  });

  test('round-trip through the amount and its unit', () => {
    for (const duration of ['P0Y0M0DT1H30M0S', 'P0Y0M3DT0H0M0S']) {
      const { amount, unit } = readDurationAmount(duration, [...units]);
      const written = writeDurationAmount(amount, unit);
      expect(readDurationAmount(written, [...units])).toEqual({ amount, unit });
    }
  });
});
