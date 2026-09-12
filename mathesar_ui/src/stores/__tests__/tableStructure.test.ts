import { readable } from 'svelte/store';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type { RawConstraint } from '@mathesar/api/rpc/constraints';

import { DB_TYPES } from '../abstract-types/dbTypes';
import {
  type TableStructure,
  getCopiedColumnMetadata,
  getCopiedColumnSpec,
  getCopiedConstraintRecipes,
  getMissingRecordTimestampSpecs,
} from '../tableStructure';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

function column(
  partial: Partial<RawColumnWithMetadata> & Pick<RawColumnWithMetadata, 'id'>,
): RawColumnWithMetadata {
  return {
    name: `column ${partial.id}`,
    description: null,
    type: DB_TYPES.TEXT,
    type_options: null,
    nullable: true,
    primary_key: false,
    default: null,
    has_dependents: false,
    current_role_priv: [],
    metadata: null,
    ...partial,
  };
}

const structureOf = (
  columns: RawColumnWithMetadata[],
  constraints: RawConstraint[] = [],
): TableStructure => ({ columns, constraints });

describe('getCopiedColumnSpec', () => {
  test('carries what makes the column what it is', () => {
    expect(
      getCopiedColumnSpec(
        column({
          id: 2,
          name: 'price',
          description: 'What it sells for',
          type: DB_TYPES.NUMERIC,
          type_options: { precision: 10, scale: 2 },
          nullable: false,
        }),
      ),
    ).toEqual({
      name: 'price',
      description: 'What it sells for',
      type: DB_TYPES.NUMERIC,
      type_options: { precision: 10, scale: 2 },
      nullable: false,
      default: undefined,
      updated_at_trigger: undefined,
    });
  });

  test('carries a literal default as it is', () => {
    const columnDefault = { is_dynamic: false, value: 'false' };
    expect(
      getCopiedColumnSpec(
        column({ id: 2, type: DB_TYPES.BOOLEAN, default: columnDefault }),
      ).default,
    ).toEqual(columnDefault);
  });

  test('writes a current time default in the spelling for the type', () => {
    expect(
      getCopiedColumnSpec(
        column({
          id: 2,
          type: DB_TYPES.TIMESTAMP_WITHOUT_TZ,
          default: { is_dynamic: true, value: '(now())::timestamp' },
        }),
      ).default,
    ).toEqual({ is_dynamic: true, value: 'LOCALTIMESTAMP' });
  });

  test('carries the current user default of a Created By column', () => {
    expect(
      getCopiedColumnSpec(
        column({
          id: 2,
          type: DB_TYPES.UUID,
          default: {
            is_dynamic: true,
            value: 'mathesar_types.current_mathesar_user()',
          },
        }),
      ).default,
    ).toEqual({
      is_dynamic: true,
      value: 'mathesar_types.current_mathesar_user()',
    });
  });

  // It would be the source table's sequence, shared with the copy.
  test('drops a default the database would not let us write', () => {
    expect(
      getCopiedColumnSpec(
        column({
          id: 2,
          type: DB_TYPES.INTEGER,
          default: { is_dynamic: true, value: "nextval('thing_seq'::regclass)" },
        }),
      ).default,
    ).toBeUndefined();
  });

  test('carries the "Updated At" trigger', () => {
    expect(
      getCopiedColumnSpec(
        column({
          id: 2,
          type: DB_TYPES.TIMESTAMP_WITH_TZ,
          updated_at_trigger: true,
        }),
      ).updated_at_trigger,
    ).toBe(true);
  });
});

describe('getMissingRecordTimestampSpecs', () => {
  const createdAt = column({
    id: 2,
    name: 'made',
    type: DB_TYPES.TIMESTAMP_WITH_TZ,
    default: { is_dynamic: true, value: 'now()' },
  });
  const updatedAt = column({
    id: 3,
    name: 'changed',
    type: DB_TYPES.TIMESTAMP_WITH_TZ,
    updated_at_trigger: true,
  });
  const names = (structure: TableStructure | undefined) =>
    getMissingRecordTimestampSpecs(structure).map((spec) => spec.name);

  test('both of them without a structure to copy', () => {
    expect(names(undefined)).toEqual(['created_at', 'updated_at']);
  });

  test('both of them when the copied table dates nothing', () => {
    expect(names(structureOf([column({ id: 2 })]))).toEqual([
      'created_at',
      'updated_at',
    ]);
  });

  // Whatever they are called: it is the trigger and the default that say so.
  test('neither when the copied table already dates its records', () => {
    expect(names(structureOf([createdAt, updatedAt]))).toEqual([]);
  });

  test('only the one the copied table is missing', () => {
    expect(names(structureOf([createdAt]))).toEqual(['updated_at']);
    expect(names(structureOf([updatedAt]))).toEqual(['created_at']);
  });
});

describe('getCopiedColumnMetadata', () => {
  test('carries what is said about a column against its new attnum', () => {
    const structure = structureOf([
      column({ id: 5, metadata: { display_width: 300 } }),
      column({ id: 6, metadata: null }),
    ]);
    expect(
      getCopiedColumnMetadata(
        structure,
        new Map([
          [5, 2],
          [6, 3],
        ]),
      ),
    ).toEqual([{ display_width: 300, attnum: 2 }]);
  });
});

describe('getCopiedConstraintRecipes', () => {
  const base = { oid: 0, name: 'c', validated: true };
  const newAttnums = new Map([
    [2, 4],
    [3, 5],
  ]);
  const recipes = (constraints: RawConstraint[]) =>
    getCopiedConstraintRecipes(structureOf([], constraints), newAttnums);

  test('makes the same constraints over the copied columns', () => {
    expect(
      recipes([
        { ...base, type: 'unique', columns: [2] },
        {
          ...base,
          type: 'foreignkey',
          columns: [3],
          referent_table_oid: 99,
          referent_columns: [1],
        },
        {
          ...base,
          type: 'check',
          columns: [2],
          pattern: 'text_box',
          expression: '',
        },
      ]),
    ).toEqual([
      { type: 'u', columns: [4] },
      { type: 'f', columns: [5], fkey_relation_id: 99, fkey_columns: [1] },
      { type: 'c', columns: [4], pattern: 'text_box' },
    ]);
  });

  test('leaves behind what it cannot make again', () => {
    expect(
      recipes([
        // The new table has a primary key of its own
        { ...base, type: 'primary', columns: [1] },
        // Over a column that wasn't copied
        { ...base, type: 'unique', columns: [1, 2] },
        // Written by someone other than Mathesar
        {
          ...base,
          type: 'check',
          columns: [2],
          pattern: null,
          expression: 'length(x) < 5',
        },
        { ...base, type: 'exclude', columns: [2] },
      ]),
    ).toEqual([]);
  });
});
