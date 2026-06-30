/**
 * sessionStorage entry utilities — pure functions, no browser dependency.
 *
 * Entry schema: { key: string, value: string }
 * Entries are fetched via page.evaluate() in BrowserService.
 *
 * Utility functions are identical to LocalStorageManager — re-exported here
 * so callers have a semantic import path for sessionStorage work.
 */

export {
  filterByKey,
  filterByValue,
  search,
  toObject,
  fromObject,
  sortByKey,
  summarize,
} from './LocalStorageManager.js';
