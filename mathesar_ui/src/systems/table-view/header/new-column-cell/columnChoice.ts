import type { ColumnCreationSpec } from '@mathesar/api/rpc/columns';
import type { RawSchemaType } from '@mathesar/api/rpc/schemas';
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';
import {
  type EnumValueEntry,
  getApiValues,
  getEntriesError,
} from '@mathesar/systems/ontology/enumValues';

/** Which choice of values a new Choice column is to hold */
export type ColumnChoice =
  /** One the schema already has, which other columns may hold too */
  | { schemaType: RawSchemaType }
  /** One to be made along with the column, offering these values */
  | { entries: EnumValueEntry[] };

export function isChoiceTheSchemaHas(
  choice: ColumnChoice,
): choice is { schemaType: RawSchemaType } {
  return 'schemaType' in choice;
}

/**
 * A name as SQL reads it, always quoted.
 *
 * A name that needs no quotes reads the same with them, and one that does -- a
 * capital letter, a space, a word SQL has its own use for -- would be read as
 * something else without them.
 */
function quoted(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** How to ask for a column of the given choice */
export function getChoiceColumnSpec(
  choice: ColumnChoice,
  schemaName: string,
): Pick<ColumnCreationSpec, 'type' | 'type_options'> {
  if (isChoiceTheSchemaHas(choice)) {
    return {
      type: `${quoted(schemaName)}.${quoted(choice.schemaType.name)}`,
      type_options: {},
    };
  }
  // "_enum" is a choice of the values given rather than a type by name; the
  // column gets one of its own, made along with it.
  return {
    type: DB_TYPES.ENUM,
    type_options: { enum_values: getApiValues(choice.entries) },
  };
}

/**
 * Why the choice isn't one a column could be added for, as something to say, or
 * undefined when it is.
 */
export function getChoiceError(choice: ColumnChoice): string | undefined {
  return isChoiceTheSchemaHas(choice)
    ? undefined
    : getEntriesError(choice.entries);
}
