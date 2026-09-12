import { readable } from 'svelte/store';

import type { RawColumnWithMetadata } from '@mathesar/api/rpc/columns';
import type {
  CheckConstraint,
  RawConstraint,
} from '@mathesar/api/rpc/constraints';
import TextAreaCell from '@mathesar/components/cell-fabric/data-types/components/textarea/TextAreaCell.svelte';
import TextBoxCell from '@mathesar/components/cell-fabric/data-types/components/textbox/TextBoxCell.svelte';

import { ProcessedColumn } from '../processedColumns';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

// Importing a cell pulls in the whole cell fabric, which reads the app data the
// server injects into the page. None of it matters for choosing a component.
vi.mock('@mathesar/utils/preloadData', () => ({
  preloadCommonData: () => ({
    databases: [],
    servers: [],
    file_backends: [],
    system_schemas: [],
    current_release_tag_name: '',
  }),
  preloadRouteData: () => undefined,
  getDefaultFileStorageBackend: () => null,
}));

const column = (type: string): RawColumnWithMetadata => ({
  id: 2,
  name: 'note',
  description: null,
  type,
  type_options: null,
  nullable: true,
  primary_key: false,
  default: null,
  has_dependents: false,
  current_role_priv: ['SELECT', 'UPDATE', 'INSERT'],
  metadata: null,
});

const textBoxConstraint: CheckConstraint = {
  oid: 99,
  name: 'note_text_box',
  type: 'check',
  columns: [2],
  validated: true,
  expression: "((note = btrim(note)) AND (note !~ '[\\r\\n]'::text))",
  pattern: 'text_box',
};

const cellOf = (type: string, constraints: RawConstraint[]) =>
  new ProcessedColumn({
    tableOid: 1,
    column: column(type),
    columnIndex: 0,
    constraints,
  }).cellComponentAndProps.component;

describe('the text box check pattern decides the cell', () => {
  test('a text column with the constraint is a single-line box', () => {
    expect(cellOf('text', [textBoxConstraint])).toBe(TextBoxCell);
  });

  test('a text column without it is a multi-line area', () => {
    expect(cellOf('text', [])).toBe(TextAreaCell);
  });

  test('a varchar column with the constraint is a single-line box', () => {
    expect(cellOf('character varying', [textBoxConstraint])).toBe(TextBoxCell);
  });

  test("someone else's check constraint is not claimed", () => {
    const unrecognized: CheckConstraint = {
      ...textBoxConstraint,
      name: 'someone_elses',
      expression: "(note <> 'banned'::text)",
      pattern: null,
    };
    expect(cellOf('text', [unrecognized])).toBe(TextAreaCell);
  });

  test('a constraint on a different column is not applied to this one', () => {
    const otherColumn: CheckConstraint = { ...textBoxConstraint, columns: [7] };
    expect(cellOf('text', [otherColumn])).toBe(TextAreaCell);
  });

  test('character is single-line from its type, with no constraint needed', () => {
    expect(cellOf('character', [])).toBe(TextBoxCell);
  });
});
