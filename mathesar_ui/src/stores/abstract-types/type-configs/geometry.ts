import type { DbType } from '@mathesar/AppTypes';
import {
  iconUiTypeCircle,
  iconUiTypeGeometry,
  iconUiTypeLine,
  iconUiTypeLineSegment,
  iconUiTypePath,
  iconUiTypePoint,
  iconUiTypePolygon,
  iconUiTypeRectangle,
} from '@mathesar/icons';
import type { IconProps } from '@mathesar-component-library/types';

import { DB_TYPES } from '../dbTypes';
import type { AbstractTypeConfiguration } from '../types';

/** Each shape a 2D column can hold has an icon of its own */
const icons: Record<DbType, IconProps & { label: string }> = {
  [DB_TYPES.POINT]: { ...iconUiTypePoint, label: 'Point' },
  [DB_TYPES.LINE]: { ...iconUiTypeLine, label: 'Line' },
  [DB_TYPES.LSEG]: { ...iconUiTypeLineSegment, label: 'Segment' },
  [DB_TYPES.BOX]: { ...iconUiTypeRectangle, label: 'Rectangle' },
  [DB_TYPES.PATH]: { ...iconUiTypePath, label: 'Path' },
  [DB_TYPES.POLYGON]: { ...iconUiTypePolygon, label: 'Polygon' },
  [DB_TYPES.CIRCLE]: { ...iconUiTypeCircle, label: 'Circle' },
};

const geometryType: AbstractTypeConfiguration = {
  getIcon: (args) =>
    (args && icons[args.dbType]) ?? { ...iconUiTypeGeometry, label: '2D' },
  defaultDbType: DB_TYPES.POINT,
  cellInfo: {
    type: 'string',
  },
};

export default geometryType;
