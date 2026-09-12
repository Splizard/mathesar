import { get } from 'svelte/store';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';

import { ColumnsDataStore } from '../columns';

const listed: RawColumnWithMetadata[] = [];
const metadataSetCalls: unknown[] = [];

vi.mock('@mathesar/api/rpc', () => ({
  api: {
    columns: {
      list_with_metadata: () => ({ run: () => Promise.resolve(listed), cancel: () => {} }),
      metadata: {
        set: (params: unknown) => {
          metadataSetCalls.push(params);
          return { params };
        },
      },
    },
  },
}));

vi.mock('@mathesar/packages/json-rpc-client-builder', () => ({
  batchRun: () => Promise.resolve([]),
}));

function makeColumn(
  id: number,
  metadata: RawColumnWithMetadata['metadata'],
): RawColumnWithMetadata {
  return {
    id,
    name: `column ${id}`,
    description: null,
    type: 'numeric',
    type_options: null,
    nullable: true,
    primary_key: false,
    default: null,
    has_dependents: false,
    current_role_priv: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
    metadata,
  };
}

async function makeStore(columns: RawColumnWithMetadata[]) {
  listed.splice(0, listed.length, ...columns);
  metadataSetCalls.length = 0;
  const store = new ColumnsDataStore({ database: { id: 1 }, table: { oid: 2 } });
  await store.fetch();
  return store;
}

describe('setDisplayOptions', () => {
  test('leaves the options it was not given alone', async () => {
    // A money column is a plain numeric wearing a currency symbol, so losing the symbol stops it
    // being money at all. Dragging its border used to do exactly that until the page was reloaded.
    const store = await makeStore([
      makeColumn(3, { mon_currency_symbol: '$', display_width: 63 }),
    ]);

    await store.setDisplayOptions(new Map([[3, { display_width: 120 }]]));

    const column = get(store.columns).find((c) => c.id === 3);
    expect(column?.metadata?.display_width).toBe(120);
    expect(column?.metadata?.mon_currency_symbol).toBe('$');
  });

  test('only asks for the option it is setting', async () => {
    const store = await makeStore([
      makeColumn(3, { mon_currency_symbol: '$', display_width: 63 }),
    ]);

    await store.setDisplayOptions(new Map([[3, { display_width: 120 }]]));

    expect(metadataSetCalls).toHaveLength(1);
    expect(metadataSetCalls[0]).toMatchObject({
      column_meta_data_list: [{ attnum: 3, display_width: 120 }],
    });
  });

  test('does not go back for the records when only the look of a column changed', async () => {
    const store = await makeStore([makeColumn(3, { display_width: 63 })]);
    let refetched = 0;
    void store.on('columnPatched', async () => {
      refetched += 1;
    });

    await store.setDisplayOptions(new Map([[3, { display_width: 120 }]]));
    expect(refetched).toBe(0);

    // A user column is different: what the back end sends back for the records depends on it.
    await store.setDisplayOptions(new Map([[3, { user_display_field: 'email' }]]));
    expect(refetched).toBe(1);
  });
});
