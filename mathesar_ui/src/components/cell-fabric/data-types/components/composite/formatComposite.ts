function formatField(field: string, fieldValue: unknown): string {
  if (fieldValue === null || fieldValue === undefined) return `${field}: NULL`;
  if (typeof fieldValue === 'object') {
    return `${field}: ${JSON.stringify(fieldValue)}`;
  }
  return `${field}: ${String(fieldValue)}`;
}

/**
 * Show a value of a composite type, which comes as an object of its fields,
 * as `field: value, field: value`, in the order of the type's fields when
 * given (the object's own order being that of JSON, not of the type).
 */
export function formatComposite(value: unknown, fieldOrder?: string[]): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  const fields = fieldOrder ?? Object.keys(record);
  return fields.map((field) => formatField(field, record[field])).join(', ');
}
