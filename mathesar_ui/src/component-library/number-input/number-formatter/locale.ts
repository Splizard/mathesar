/**
 * Get the character that the given locale will use to separate the integer and
 * fractional parts of a number. If no locale is passed, then it will be
 * inferred from the environment.
 */
const decimalSeparatorCache = new Map<string | undefined, string>();

export function getDecimalSeparator(locale?: string): string {
  // Constructing an `Intl.NumberFormat` is slow (especially in Firefox) and
  // this runs for every number formatted in the table, so cache per locale.
  const cached = decimalSeparatorCache.get(locale);
  if (cached !== undefined) {
    return cached;
  }

  // We are formatting a number and then reading the second character of the
  // result. Will this work for all locales? It seems to!
  //
  // You can run this TS in the Deno REPL:
  //
  // ```ts
  // import { getAllLanguageCode } from "https://deno.land/x/language/mod.ts";
  // new Set(getAllLanguageCode().map(c => new Intl.NumberFormat(c).format(1.2)))
  // ```
  //
  // It gives: `Set { "1.2", "1,2", "১.২", "۱٫۲", "१.२" }` which tells me that
  // relying on the second character of the result should work in all locales.
  const decimalSeparator = new Intl.NumberFormat(locale).format(1.2)[1];
  if (!['.', ','].includes(decimalSeparator)) {
    // This is an extra validation step for safety's sake since we'll be using
    // this decimal separator inside a regular expression.
    throw new Error(`Unsupported decimal separator: ${decimalSeparator}`);
  }
  decimalSeparatorCache.set(locale, decimalSeparator);
  return decimalSeparator;
}
