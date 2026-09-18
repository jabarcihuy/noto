/** Saved search entity (docs/DATABASE.md §4.8, PRD §11.5). Stores rules, never results. */

import { isSearchSort, type SearchFilters, type SearchSort } from './search';

export type SavedSearchSort = SearchSort;
export type SavedSearchFilters = SearchFilters;

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  filters: SavedSearchFilters;
  sort: SavedSearchSort;
  createdAt: string;
  updatedAt: string;
};

export const isSavedSearchSort = isSearchSort;
