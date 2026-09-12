import { iconUiTypeDatabaseTable } from '@mathesar/icons';

import { DB_TYPES } from '../dbTypes';
import type { AbstractTypeConfiguration } from '../types';

/** A column holding one of the database's tables, as a `regclass` */
const databaseTableType: AbstractTypeConfiguration = {
  getIcon: () => ({ ...iconUiTypeDatabaseTable, label: 'Database Table' }),
  defaultDbType: DB_TYPES.REGCLASS,
  cellInfo: {
    type: 'databaseTable',
  },
};

export default databaseTableType;
