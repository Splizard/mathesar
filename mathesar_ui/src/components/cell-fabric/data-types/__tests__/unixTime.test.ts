import '@testing-library/jest-dom';
import { render } from '@testing-library/svelte';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';

import DateTimeCell from '../components/date-time/DateTimeCell.svelte';
import NumberCell from '../components/number/NumberCell.svelte';
import numberType from '../number';

function column(metadata: unknown): RawColumnWithMetadata {
  return {
    id: 1,
    name: 'observed',
    type: 'bigint',
    type_options: null,
    metadata,
  } as unknown as RawColumnWithMetadata;
}

const plain = column(null);
const inSeconds = column({
  num_unix_time: 'seconds',
  date_format: 'iso',
  time_format: '24hrLong',
});
const inNanoseconds = column({
  ...inSeconds.metadata,
  num_unix_time: 'nanoseconds',
});

/** 2026-09-12 10:20:00 UTC, as each column above counts it */
const instant = Date.UTC(2026, 8, 12, 10, 20, 0);
const seconds = String(instant / 1000);
const nanoseconds = `${seconds}000000000`;
/** The same instant where the browser running this happens to be */
const shown = new Date(instant).toLocaleString('sv-SE');

function contentOf(col: RawColumnWithMetadata, value: string) {
  const { component, props } = numberType.get(col);
  const { container } = render(component, {
    props: {
      ...(props as Record<string, unknown>),
      isActive: false,
      disabled: false,
      setValue: () => {},
      value,
    },
  });
  return container.querySelector('.content');
}

describe('number cells counting from the Unix epoch', () => {
  test('are date cells, where a plain number column is a number cell', () => {
    expect(numberType.get(inSeconds).component).toBe(DateTimeCell);
    expect(numberType.get(plain).component).toBe(NumberCell);
  });

  test('show the date the count names, not the count', () => {
    const content = contentOf(inSeconds, seconds);
    expect(content).toHaveTextContent(shown);
    expect(content).not.toHaveTextContent(seconds);
  });

  test('read a nanosecond count, which is too big for a JS number', () => {
    expect(contentOf(inNanoseconds, nanoseconds)).toHaveTextContent(shown);
  });

  test('are copied and exported as dates too', () => {
    expect(numberType.getDisplayFormatter?.(inSeconds)(seconds)).toBe(shown);
    // Still just a number where nobody said it was a time
    expect(numberType.getDisplayFormatter?.(plain)(seconds)).toBe(
      Number(seconds).toLocaleString(),
    );
  });

  test('leave a value they cannot read alone', () => {
    expect(numberType.getDisplayFormatter?.(inSeconds)('')).toBe('');
  });
});
