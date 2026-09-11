import { isUserColumn } from '@mathesar/stores/abstract-types/type-configs/uuid';

import string from './string';
import type { CellComponentFactory } from './typeDefinitions';
import user from './user';

/** UUID cells, which show users when the column's values are Mathesar users */
function factoryFor(column: Parameters<CellComponentFactory['get']>[0]) {
  return isUserColumn(column.metadata) ? user : string;
}

const uuidType: CellComponentFactory = {
  initialInputValue: null,
  get: (column, config) => factoryFor(column).get(column, config),
  getInput: (column, config) => factoryFor(column).getInput(column, config),
  getSimpleInput: (column, config) => {
    const factory = factoryFor(column);
    return (factory.getSimpleInput ?? factory.getInput)(column, config);
  },
  getDisplayFormatter: (column, config) =>
    factoryFor(column).getDisplayFormatter(column, config),
};

export default uuidType;
