import '@testing-library/jest-dom';
import { render } from '@testing-library/svelte';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';

import DurationCell from '../components/duration/DurationCell.svelte';
import durationType from '../duration';

const column = {
  id: 1,
  name: 'length',
  type: 'interval',
  type_options: null,
  metadata: null,
} as unknown as RawColumnWithMetadata;

/** What the database gives for an hour and a half */
const anHourAndAHalf = 'P0Y0M0DT1H30M0S';

describe('duration cells', () => {
  test('show the duration in the column format, not as PostgreSQL writes it', () => {
    const cellProps = durationType.get(column).props as Record<string, unknown>;
    const { container } = render(DurationCell, {
      props: {
        ...cellProps,
        isActive: false,
        disabled: false,
        setValue: () => {},
        value: anHourAndAHalf,
      },
    });
    const content = container.querySelector('.content');
    expect(content).toHaveTextContent('90:00');
    expect(content).not.toHaveTextContent(anHourAndAHalf);
  });

  test('are copied and exported in that format too', () => {
    expect(durationType.getDisplayFormatter?.(column)(anHourAndAHalf)).toBe(
      '90:00',
    );
  });
});
