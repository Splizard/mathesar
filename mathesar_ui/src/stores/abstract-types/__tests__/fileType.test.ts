import { readable } from 'svelte/store';

import { parseFileReference } from '@mathesar/components/file-attachments/fileUtils';

import {
  abstractTypeToColumnSaveSpec,
  getAbstractTypeForDbType,
  getAllowedAbstractTypesForDbTypeAndItsTargetTypes,
} from '../abstractTypeCategories';
import { DB_TYPES } from '../dbTypes';

vi.mock('svelte-i18n', () => {
  const translate = (s: string) => s;
  return { _: readable(translate) };
});

vi.mock('@mathesar/utils/preloadData', async () => ({
  ...(await vi.importActual<object>('@mathesar/utils/preloadData')),
  getDefaultFileStorageBackend: () => ({
    backend: 'default',
    anonymous_access: true,
  }),
}));

const file = getAbstractTypeForDbType(DB_TYPES.MSAR__FILE, null);

describe('recognising File', () => {
  test('by its database type alone', () => {
    expect(file.identifier).toBe('file');
  });

  test('not by the metadata json(b) file columns used to have', () => {
    expect(
      getAbstractTypeForDbType(DB_TYPES.JSONB, {
        file_backend: 'default',
      }).identifier,
    ).toBe('json');
  });

  test('columns of other types cannot become File', () => {
    const identifiers = (dbType: string) =>
      getAllowedAbstractTypesForDbTypeAndItsTargetTypes(dbType, null).map(
        (t) => t.identifier,
      );
    expect(identifiers(DB_TYPES.JSONB)).not.toContain('file');
    expect(identifiers(DB_TYPES.TEXT)).not.toContain('file');
    expect(identifiers(DB_TYPES.MSAR__FILE)).toEqual(['file']);
  });

  test('new File columns are of the file type, uploading to the default backend', () => {
    const spec = abstractTypeToColumnSaveSpec(file);
    expect(spec.dbOptions.type).toBe(DB_TYPES.MSAR__FILE);
    expect(spec.metadata).toEqual({ file_backend: 'default' });
  });
});

describe('parseFileReference', () => {
  const reference = {
    link: 's3://bucket/pic.png',
    mime: 'image/png',
    hmac: 'v1-abc',
  };

  test('accepts file values', () => {
    expect(parseFileReference(reference)).toBe(reference);
    expect(parseFileReference({ ...reference, mime: null })).toEqual({
      ...reference,
      mime: null,
    });
  });

  test('rejects anything else', () => {
    expect(parseFileReference(null)).toBeUndefined();
    expect(parseFileReference(JSON.stringify(reference))).toBeUndefined();
    expect(parseFileReference({ ...reference, hmac: null })).toBeUndefined();
    expect(parseFileReference({ ...reference, mime: 3 })).toBeUndefined();
    expect(
      parseFileReference({ uri: reference.link, mash: 'abc' }),
    ).toBeUndefined();
  });
});
