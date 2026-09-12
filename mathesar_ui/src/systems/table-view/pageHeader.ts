/**
 * Whether the breadcrumb shows above a table on a screen too small for the table's panes.
 *
 * Hidden whenever a table is opened, and deliberately not remembered. It is something to reach
 * for on the way somewhere else rather than a way somebody likes their tables, so every table
 * starts with the room given back to the table and the breadcrumb one tap away.
 */
import { writable } from 'svelte/store';

export const compactPageHeaderVisible = writable(false);
