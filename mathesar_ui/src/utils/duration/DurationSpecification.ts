import {
  type DurationFormat,
  type DurationUnit,
  allDurationUnits,
  defaultColumnMetadata,
} from '@mathesar/api/rpc/_common/columnDisplayOptions';

export interface DurationConfig {
  max: DurationUnit;
  min: DurationUnit;
  /** Whether a duration is shown as a time on a clock, or written out */
  format?: DurationFormat;
}

const defaults: Required<DurationConfig> = {
  max: defaultColumnMetadata.duration_max,
  min: defaultColumnMetadata.duration_min,
  format: defaultColumnMetadata.duration_format,
};

const formattingTokens: Record<DurationUnit, string> = {
  d: 'D',
  h: 'HH',
  m: 'mm',
  s: 'ss',
  ms: 'SSS',
};

export default class DurationSpecification {
  readonly min: DurationUnit;

  readonly max: DurationUnit;

  readonly format: DurationFormat;

  constructor(config?: Partial<DurationConfig>) {
    this.min = config?.min ?? defaults.min;
    this.max = config?.max ?? defaults.max;
    this.format = config?.format ?? defaults.format;
  }

  isWrittenOut(): boolean {
    return this.format === 'words';
  }

  getUnitsInRange(): DurationUnit[] {
    return allDurationUnits.slice(
      allDurationUnits.indexOf(this.max),
      allDurationUnits.indexOf(this.min) + 1,
    );
  }

  getHigherUnit(unit: DurationUnit): DurationUnit | null {
    const higherUnit = allDurationUnits[allDurationUnits.indexOf(unit) - 1];
    if (!higherUnit) {
      return null;
    }
    if (
      allDurationUnits.indexOf(higherUnit) < allDurationUnits.indexOf(this.max)
    ) {
      return null;
    }
    return higherUnit;
  }

  getFormattingString(): string {
    const tokens = this.getUnitsInRange().map((unit) => formattingTokens[unit]);
    if (tokens.length === 1) {
      return tokens[0];
    }
    if (tokens[tokens.length - 1] === formattingTokens.ms) {
      return [
        tokens.slice(0, tokens.length - 1).join(':'),
        tokens[tokens.length - 1],
      ].join('.');
    }
    return tokens.join(':');
  }

  static getAllUnits(): DurationUnit[] {
    return [...allDurationUnits];
  }

  static getDefaults(): Required<DurationConfig> {
    return defaults;
  }
}
