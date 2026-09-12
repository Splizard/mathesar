import { hasMethod } from './typeUtils';

const ID_PREFIX = '_id';

export function getGloballyUniqueId(customPrefix?: string): string {
  const prefix = customPrefix ?? ID_PREFIX;

  // randomUUID is only present in secure contexts such as https or localhost
  if (crypto && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  // Does not _definitively_ ensure uniqueness but should suffice for our cases
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .substring(2)}`;
}

export function focusAndSelectAll(element: HTMLInputElement): void {
  element.focus();
  element.setSelectionRange(0, element.value.length);
}

export function focusElement(element: unknown): void {
  if (hasMethod(element, 'focus')) {
    element.focus();
  }
}

export function blurElement(element: unknown): void {
  if (hasMethod(element, 'blur')) {
    element.blur();
  }
}

/**
 * The `type` values of an `input` the user types into, as against the ones
 * that are really buttons or pickers.
 */
const textEntryInputTypes = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
]);

/**
 * Whether the element is somewhere the user writes: a text input, a text area,
 * or anything made editable. A right-click there belongs to the browser, whose
 * menu holds the spelling suggestions and the clipboard, and not to whatever
 * the field happens to sit inside.
 */
export function isTextEntry(element: unknown): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return textEntryInputTypes.has(element.type);
  }
  // Editability is inherited, and the nearest one to say either way wins. Read
  // from the attribute rather than `isContentEditable`, which jsdom lacks.
  const declared = element.closest('[contenteditable]');
  if (!declared) return false;
  const value = declared.getAttribute('contenteditable');
  return value === '' || value === 'true' || value === 'plaintext-only';
}
