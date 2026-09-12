import '@testing-library/jest-dom';
import { cleanup, fireEvent, render } from '@testing-library/svelte';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import { mergeMetadataOnTypeChange } from '@mathesar/stores/abstract-types/abstractTypeCategories';
import type { AbstractType } from '@mathesar/stores/abstract-types/types';

import DateTimeCell from '../components/date-time/DateTimeCell.svelte';
import TimeCheckboxCell from '../components/time-checkbox/TimeCheckboxCell.svelte';
import datetimeType from '../datetime';

// `render` puts every component into document.body, so one render per test
afterEach(cleanup);

function column(metadata: unknown): RawColumnWithMetadata {
  return {
    id: 1,
    name: 'completed_at',
    type: 'timestamp without time zone',
    type_options: null,
    metadata,
  } as unknown as RawColumnWithMetadata;
}

const asDateTime = column({ date_format: 'iso', time_format: '24hr' });
const asCheckbox = column({ ...asDateTime.metadata, time_checkbox: true });

function renderCell(col: RawColumnWithMetadata, value: unknown) {
  const { component, props } = datetimeType.get(col);
  const setValue = vi.fn();
  const rendered = render(component, {
    props: {
      ...(props as Record<string, unknown>),
      isActive: true,
      disabled: false,
      isIndependentOfSheet: true,
      setValue,
      value,
    },
  });
  return { ...rendered, setValue };
}

/**
 * A column named for something that happened — archived_at, completed_at — is
 * ticked more often than it is read. The value stays the instant either way.
 */
describe('an instant shown as a tick', () => {
  test('is a checkbox where a plain instant is a date and time cell', () => {
    expect(datetimeType.get(asCheckbox).component).toBe(TimeCheckboxCell);
    expect(datetimeType.get(asDateTime).component).toBe(DateTimeCell);
  });

  test('is ticked when there is an instant', () => {
    const { container } = renderCell(asCheckbox, '2026-09-12 19:20:00');
    expect(container.querySelector('input')).toBeChecked();
  });

  test('is not ticked when there is none', () => {
    const { container } = renderCell(asCheckbox, null);
    expect(container.querySelector('input')).not.toBeChecked();
  });

  test('writes the moment it was ticked', async () => {
    const before = Date.now();
    const { container, setValue } = renderCell(asCheckbox, null);
    await fireEvent.click(container.querySelector('input') as HTMLInputElement);
    expect(setValue).toHaveBeenCalledTimes(1);
    const written = setValue.mock.calls[0][0] as string;
    // The column's own canonical form, which is what it reads back
    expect(written).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    const stamped = new Date(written).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test('clears the instant when it is unticked', async () => {
    const { container, setValue } = renderCell(
      asCheckbox,
      '2026-09-12 19:20:00',
    );
    await fireEvent.click(container.querySelector('input') as HTMLInputElement);
    expect(setValue).toHaveBeenCalledWith(null);
  });

  test('is still just an instant to everything that reads the value', () => {
    expect(datetimeType.getDisplayFormatter?.(asCheckbox)('2026-09-12 19:20:00')).toBe(
      '2026-09-12 19:20',
    );
  });

  test('stops being a tick when the column stops holding instants', () => {
    const text = { identifier: 'text' } as AbstractType;
    expect(
      mergeMetadataOnTypeChange(text, asCheckbox.metadata ?? null),
    ).toMatchObject({ time_checkbox: false });
    const dateTime = { identifier: 'datetime' } as AbstractType;
    expect(
      mergeMetadataOnTypeChange(dateTime, asCheckbox.metadata ?? null),
    ).toMatchObject({ time_checkbox: true });
  });
});
