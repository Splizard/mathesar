import { getContext, setContext } from 'svelte';
import { type Writable, writable } from 'svelte/store';

import type { Schema } from '@mathesar/models/Schema';

import type { BreadcrumbItem, BreadcrumbItemDatabase } from './breadcrumbTypes';

const contextKey = Symbol('breadcrumb items store');

export const BREADCRUMB_SELECTOR_ROW_CLASS = 'breadcrumb-selector-row';

export function breadcrumbItemIsDatabase(
  item: BreadcrumbItem,
): item is BreadcrumbItemDatabase {
  return item.type === 'database';
}

/**
 * The schema the page is in, if it is in one.
 *
 * A phone shows it in the top bar in place of the product's name, so the trail behind the button
 * need only say which database it is.
 */
export function getSchemaFromBreadcrumbItems(
  items: BreadcrumbItem[],
): Schema | undefined {
  for (const item of items) {
    switch (item.type) {
      case 'schema':
      case 'table':
      case 'record':
      case 'exploration':
        return item.schema;
      case 'dataForm':
        return item.dataForm.schema;
      default:
        break;
    }
  }
  return undefined;
}

export function setBreadcrumbItemsInContext(items: BreadcrumbItem[]): void {
  setContext(contextKey, writable(items));
}

export function getBreadcrumbItemsFromContext(): Writable<BreadcrumbItem[]> {
  return getContext(contextKey);
}
