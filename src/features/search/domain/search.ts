/**
 * Search domain rules (docs/FEATURES.md §7, docs/DATABASE.md §6). Pure code: query
 * normalization, filter shape, and paging. No SQLite or React imports.
 */

import type { CaptureType, Note } from '@/features/notes/domain/note';

export type SearchSort = 'updated_desc' | 'opened_desc' | 'created_desc' | 'created_asc';

export type SearchFilters = {
  /** Normalized tag names; multiple tags use AND (docs/FEATURES.md §7.2). */
  tags?: string[];
  /** Notebook ID, never a display name. */
  notebookId?: string | null;
  /** Provisional: see `date-range.ts` and the date basis open question. */
  dateFrom?: string | null;
  dateTo?: string | null;
  captureType?: CaptureType | null;
};

export type SearchRequest = {
  query: string;
  filters?: SearchFilters;
  sort?: SearchSort;
  limit?: number;
  offset?: number;
};

export type SearchResultItem = {
  note: Note;
  /** Raw snippet with `SNIPPET_OPEN`/`SNIPPET_CLOSE` markers, or null for browse mode. */
  snippet: string | null;
  matchedIn: 'title' | 'content' | 'none';
};

export type SearchPage = {
  items: SearchResultItem[];
  /** True when at least one more row exists after this page. */
  hasMore: boolean;
  /** The search engine actually used; never silently swapped. */
  engine: 'fts5' | 'like';
};

export const DEFAULT_SEARCH_LIMIT = 25;
export const MAX_SEARCH_LIMIT = 50;

export function normalizeSearchQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

/** Splits a query into literal tokens. No boolean/phrase syntax is honored. */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchQuery(query);
  if (normalized.length === 0) return [];
  return normalized.split(' ').filter((token) => token.length > 0);
}

/**
 * Builds a safe FTS5 MATCH expression: every token is treated as a quoted literal with a
 * prefix match, combined with AND. Embedded quotes are doubled so user text can never be
 * interpreted as FTS syntax (docs/FEATURES.md §7.1).
 */
export function buildFtsMatchExpression(tokens: string[]): string {
  return tokens
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' AND ');
}

export function isFilterActive(filters: SearchFilters | undefined): boolean {
  if (!filters) return false;
  return (
    (filters.tags?.length ?? 0) > 0 ||
    filters.notebookId != null ||
    filters.captureType != null ||
    filters.dateFrom != null ||
    filters.dateTo != null
  );
}

export function isSearchSort(value: string): value is SearchSort {
  return (
    value === 'updated_desc' ||
    value === 'opened_desc' ||
    value === 'created_desc' ||
    value === 'created_asc'
  );
}
