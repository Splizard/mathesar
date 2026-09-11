import {
  iconFile,
  iconUiTypeArray,
  iconUiTypeBinary,
  iconUiTypeBoolean,
  iconUiTypeComposite,
  iconUiTypeDatabaseTable,
  iconUiTypeDateTime,
  iconUiTypeEnum,
  iconUiTypeGeometry,
  iconUiTypeJson,
  iconUiTypeNetwork,
  iconUiTypeNumber,
  iconUiTypeText,
  iconUiTypeUnknown,
  iconUiTypeUuid,
  iconUiTypeXml,
} from '@mathesar/icons';
import type { IconProps } from '@mathesar-component-library/types';

import { abstractTypeCategory as t } from './constants';
import type { AbstractType } from './types';

/**
 * A family of data types, which is what Mathesar offers people to choose:
 * the types within a family are kinds of it, chosen among in the inspector
 * (e.g., Time's kinds are Date & Time, Date, Duration, Created At, and so on).
 */
export interface TypeFamily {
  identifier: string;
  name: string;
  icon: IconProps;
  /**
   * The identifiers of the family's types, in the order they're offered, the
   * first being the one a new column of the family gets.
   */
  members: string[];
}

export const typeFamilies: TypeFamily[] = [
  {
    identifier: 'text',
    name: 'Text',
    icon: iconUiTypeText,
    members: [t.Text, t.Email, t.Uri],
  },
  {
    identifier: 'number',
    name: 'Number',
    icon: iconUiTypeNumber,
    members: [t.Number, t.Money, t.NumberRange],
  },
  {
    identifier: 'time',
    name: 'Time',
    icon: iconUiTypeDateTime,
    members: [
      t.DateTime,
      t.Date,
      t.Time,
      t.Duration,
      t.CreatedAt,
      t.UpdatedAt,
      t.TimeRange,
    ],
  },
  {
    identifier: 'boolean',
    name: 'Boolean',
    icon: iconUiTypeBoolean,
    members: [t.Boolean],
  },
  { identifier: 'uuid', name: 'UUID', icon: iconUiTypeUuid, members: [t.Uuid] },
  { identifier: 'file', name: 'File', icon: iconFile, members: [t.File] },
  {
    identifier: 'choice',
    name: 'Choice',
    icon: iconUiTypeEnum,
    members: [t.Enum],
  },
  {
    identifier: 'array',
    name: 'Array',
    icon: iconUiTypeArray,
    members: [t.Array],
  },
  {
    identifier: 'composite',
    name: 'Composite',
    icon: iconUiTypeComposite,
    members: [t.Composite],
  },
  {
    identifier: 'json',
    name: 'JSON',
    icon: iconUiTypeJson,
    members: [t.Json, t.JsonArray, t.JsonObject],
  },
  { identifier: 'xml', name: 'XML', icon: iconUiTypeXml, members: [t.Xml] },
  {
    identifier: 'binary',
    name: 'Binary',
    icon: iconUiTypeBinary,
    members: [t.Binary],
  },
  {
    identifier: 'network',
    name: 'IP',
    icon: iconUiTypeNetwork,
    members: [t.Network],
  },
  {
    identifier: 'geometry',
    name: '2D',
    icon: iconUiTypeGeometry,
    members: [t.Geometry],
  },
  {
    identifier: 'databaseTable',
    name: 'Database Table',
    icon: iconUiTypeDatabaseTable,
    members: [t.DatabaseTable],
  },
  {
    identifier: 'other',
    name: 'Other',
    icon: iconUiTypeUnknown,
    members: [t.Other],
  },
];

const familyOfType = new Map(
  typeFamilies.flatMap((family) =>
    family.members.map((member) => [member, family]),
  ),
);

const otherFamily = typeFamilies[typeFamilies.length - 1];

export function getTypeFamily(abstractType: Pick<AbstractType, 'identifier'>) {
  return familyOfType.get(abstractType.identifier) ?? otherFamily;
}

/**
 * What a type is called as a kind of its family: its name, except where that
 * would read as the family itself.
 */
export function getKindName(abstractType: AbstractType): string {
  if (abstractType.identifier === t.Time) return 'Time of Day';
  return abstractType.name;
}

/**
 * Group types by family, keeping the families' order and each family's order
 * of its types.
 */
export function groupByFamily(
  abstractTypes: AbstractType[],
): { family: TypeFamily; members: AbstractType[] }[] {
  return typeFamilies
    .map((family) => ({
      family,
      members: family.members.flatMap(
        (member) => abstractTypes.find((a) => a.identifier === member) ?? [],
      ),
    }))
    .filter(({ members }) => members.length > 0);
}
