import type { DbType } from '@mathesar/AppTypes';
import type { IconProps } from '@mathesar-component-library/types';

import type { AbstractTypeConfiguration } from '../types';

/**
 * A type Mathesar shows and edits as the text PostgreSQL gives for its values,
 * having no richer way to yet.
 */
export function plainType(
  icon: IconProps,
  label: string,
  defaultDbType: DbType,
): AbstractTypeConfiguration {
  return {
    getIcon: () => ({ ...icon, label }),
    defaultDbType,
    cellInfo: {
      type: 'string',
    },
  };
}
