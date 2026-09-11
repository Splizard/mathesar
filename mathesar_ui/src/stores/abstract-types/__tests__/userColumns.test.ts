import { readable } from 'svelte/store';

import type { ProcessedColumn } from '@mathesar/stores/table-data';
import { getDefaultValueOptions } from '@mathesar/systems/table-view/table-inspector/column/defaultValueOptions';

import {
  getAbstractTypeForDbType,
  getAllowedAbstractTypesForNewColumn,
  mergeMetadataOnTypeChange,
} from '../abstractTypeCategories';
import {
  currentUserDefaultExpression,
  isCurrentUserDefault,
} from '../currentUserDefault';
import { DB_TYPES } from '../dbTypes';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

const userMetadata = { user_display_field: 'username' as const };
const uuid = getAbstractTypeForDbType(DB_TYPES.UUID, null);
const currentUser = { is_dynamic: true, value: currentUserDefaultExpression };

function column(
  props: Partial<ProcessedColumn['column']>,
): Pick<ProcessedColumn, 'column'> {
  return {
    column: {
      id: 3,
      name: 'Assignee',
      type: DB_TYPES.UUID,
      type_options: null,
      nullable: true,
      primary_key: false,
      default: null,
      has_dependents: false,
      description: null,
      current_role_priv: [],
      metadata: userMetadata,
      ...props,
    },
  };
}

describe('user columns', () => {
  test('are UUID columns shown as users', () => {
    const type = getAbstractTypeForDbType(DB_TYPES.UUID, userMetadata);
    expect(type.identifier).toBe('uuid');
    expect(
      type.getIcon({
        dbType: DB_TYPES.UUID,
        typeOptions: null,
        metadata: userMetadata,
      }),
    ).toMatchObject({ label: 'User' });
    expect(
      uuid.getIcon({
        dbType: DB_TYPES.UUID,
        typeOptions: null,
        metadata: null,
      }),
    ).toMatchObject({ label: 'UUID' });
  });

  test("aren't integer columns any more, nor a type of their own", () => {
    expect(
      getAbstractTypeForDbType(DB_TYPES.INTEGER, userMetadata).identifier,
    ).toBe('number');
    expect(
      getAllowedAbstractTypesForNewColumn().map((t) => t.identifier),
    ).not.toContain('user');
  });

  test('stop being users when changed to another type', () => {
    const number = getAbstractTypeForDbType(DB_TYPES.INTEGER, null);
    expect(mergeMetadataOnTypeChange(number, userMetadata)).toMatchObject({
      user_display_field: null,
    });
    expect(mergeMetadataOnTypeChange(uuid, userMetadata)).toMatchObject(
      userMetadata,
    );
  });

  test('are shown as users through their display options', () => {
    const config = uuid.getDisplayConfig?.();
    expect(
      config?.determineDisplayOptions({
        showAs: 'user',
        displayField: 'email',
      }),
    ).toEqual({ user_display_field: 'email' });
    expect(
      config?.determineDisplayOptions({
        showAs: 'uuid',
        displayField: 'email',
      }),
    ).toEqual({ user_display_field: null });
    expect(
      config?.constructDisplayFormValuesFromDisplayOptions(userMetadata),
    ).toMatchObject({ showAs: 'user', displayField: 'username' });
  });
});

describe('filling in user columns', () => {
  const modes = (props: Partial<ProcessedColumn['column']>) =>
    getDefaultValueOptions(column(props) as ProcessedColumn);

  test('offers Created By and Updated By', () => {
    expect(modes({}).availableModes).toEqual([
      'none',
      'set_default_user',
      'current_user',
      'last_editor',
    ]);
    expect(modes({}).initialMode).toBe('none');
    expect(modes({ default: currentUser }).initialMode).toBe('current_user');
    expect(modes({ updated_at_trigger: true }).initialMode).toBe('last_editor');
    expect(
      modes({ default: { is_dynamic: false, value: 'a0eebc99' } }).initialMode,
    ).toBe('set_default_user');
  });

  test('only for user columns, unless one is still in effect', () => {
    expect(modes({ metadata: null }).availableModes).toEqual([
      'none',
      'custom',
    ]);
    expect(
      modes({ metadata: null, updated_at_trigger: true }).initialMode,
    ).toBe('last_editor');
  });

  test('recognises the current user default', () => {
    expect(isCurrentUserDefault(currentUser)).toBe(true);
    expect(isCurrentUserDefault({ ...currentUser, is_dynamic: false })).toBe(
      false,
    );
    expect(isCurrentUserDefault({ is_dynamic: true, value: 'now()' })).toBe(
      false,
    );
  });
});
