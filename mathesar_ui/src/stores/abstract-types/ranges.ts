import type { DbType } from '@mathesar/AppTypes';

import { DB_TYPES } from './dbTypes';

export interface RangeTypes {
  /** The type of the values the ranges are of */
  value: DbType;
  range: DbType;
  multirange: DbType;
}

const int4 = {
  value: DB_TYPES.INTEGER,
  range: DB_TYPES.INT4RANGE,
  multirange: DB_TYPES.INT4MULTIRANGE,
};
const int8 = {
  value: DB_TYPES.BIGINT,
  range: DB_TYPES.INT8RANGE,
  multirange: DB_TYPES.INT8MULTIRANGE,
};
const num = {
  value: DB_TYPES.NUMERIC,
  range: DB_TYPES.NUMRANGE,
  multirange: DB_TYPES.NUMMULTIRANGE,
};
const ts = {
  value: DB_TYPES.TIMESTAMP_WITHOUT_TZ,
  range: DB_TYPES.TSRANGE,
  multirange: DB_TYPES.TSMULTIRANGE,
};
const tstz = {
  value: DB_TYPES.TIMESTAMP_WITH_TZ,
  range: DB_TYPES.TSTZRANGE,
  multirange: DB_TYPES.TSTZMULTIRANGE,
};
const date = {
  value: DB_TYPES.DATE,
  range: DB_TYPES.DATERANGE,
  multirange: DB_TYPES.DATEMULTIRANGE,
};

/**
 * PostgreSQL's range types, in groups whose ranges Mathesar can cast between,
 * of the kinds whose values it can cast to any of their ranges.
 */
const rangeTypeGroups: RangeTypes[][][] = [
  [[int4, int8], [num]],
  [[ts, tstz], [date]],
];

const allRangeTypes = rangeTypeGroups.flat(2);

/**
 * The range types of values of the given type, if it has any: smallint values
 * have integer ranges.
 */
export function getRangeTypesOfValues(dbType: DbType): RangeTypes | undefined {
  const valueType = dbType === DB_TYPES.SMALLINT ? DB_TYPES.INTEGER : dbType;
  return allRangeTypes.find((r) => r.value === valueType);
}

/**
 * The range types that a range or multirange type is among, if it's one.
 */
export function getRangeTypesOf(dbType: DbType): RangeTypes | undefined {
  return allRangeTypes.find(
    (r) => r.range === dbType || r.multirange === dbType,
  );
}

export function isMultirangeType(dbType: DbType): boolean {
  return getRangeTypesOf(dbType)?.multirange === dbType;
}

/**
 * Add the casts Mathesar has to and between ranges: from values to ranges of
 * their kind, and between the ranges and multiranges of a group.
 */
export function addRangeCasts(
  castMap: Record<DbType, DbType[]>,
): Record<DbType, DbType[]> {
  const result = { ...castMap };
  const add = (from: DbType, targets: DbType[]) => {
    result[from] = [...new Set([...(result[from] ?? []), ...targets])];
  };
  const typesOf = (rangeTypes: RangeTypes[]) =>
    rangeTypes.flatMap((r) => [r.range, r.multirange]);
  for (const group of rangeTypeGroups) {
    for (const kindRangeTypes of group) {
      for (const r of kindRangeTypes) {
        add(r.value, typesOf(kindRangeTypes));
        add(r.range, typesOf(group.flat()));
        add(r.multirange, typesOf(group.flat()));
      }
    }
  }
  add(DB_TYPES.SMALLINT, typesOf([int4, int8]));
  return result;
}
