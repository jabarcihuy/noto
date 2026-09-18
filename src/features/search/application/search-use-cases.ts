import type { SqliteConnection } from '@/core/db/sqlite-port';
import type { CaptureType } from '@/features/notes/domain/note';

import type { SavedSearchRepository } from '../data/saved-search-repository';
import type { SearchRepository } from '../data/search-repository';
import {
  normalizeSearchQuery,
  type SearchFilters,
  type SearchPage,
  type SearchRequest,
  type SearchSort,
} from '../domain/search';
import type { SavedSearch } from '../domain/saved-search';

export type SearchUseCases = ReturnType<typeof createSearchUseCases>;

function sanitizeFilters(filters: SearchFilters | undefined): SearchFilters {
  const result: SearchFilters = {};
  if (!filters) return result;
  if (filters.tags && filters.tags.length > 0) {
    const tags = [...new Set(filters.tags.filter((name) => name.trim().length > 0))];
    if (tags.length > 0) result.tags = tags;
  }
  if (filters.notebookId != null) result.notebookId = filters.notebookId;
  if (filters.captureType != null) result.captureType = filters.captureType;
  if (filters.dateFrom != null) result.dateFrom = filters.dateFrom;
  if (filters.dateTo != null) result.dateTo = filters.dateTo;
  return result;
}

/**
 * Search and saved-search application layer (docs/FEATURES.md §7). The UI calls these;
 * repositories own SQL. Saved searches store rules only and are recomputed on open.
 */
export function createSearchUseCases(deps: {
  connection: SqliteConnection;
  search: SearchRepository;
  savedSearches: SavedSearchRepository;
  fts5Available: boolean;
}) {
  const { connection, search, savedSearches, fts5Available } = deps;

  return {
    /** True when the runtime lacks FTS5 and `LIKE` fallback is in use. */
    isDegraded(): boolean {
      return !fts5Available;
    },

    search(request: SearchRequest): Promise<SearchPage> {
      return search.search(
        connection,
        { ...request, query: normalizeSearchQuery(request.query) },
        { fts5: fts5Available },
      );
    },

    countNotes(): Promise<number> {
      return search.countNotes(connection);
    },

    listCaptureTypes(): Promise<CaptureType[]> {
      return search.listCaptureTypes(connection);
    },

    /** Saved searches, ordered by name. Rules only; results are never stored. */
    listSavedSearches(): Promise<SavedSearch[]> {
      return savedSearches.list(connection);
    },

    getSavedSearch(id: string): Promise<SavedSearch | null> {
      return savedSearches.getById(connection, id);
    },

    /**
     * Creates a saved search from the current query/filters/sort. Rename/reorder/delete
     * remain an open product question (`ROADMAP.md`), so they are not implemented here.
     */
    async createSavedSearch(input: {
      name: string;
      query?: string;
      filters?: SearchFilters;
      sort?: SearchSort;
    }): Promise<SavedSearch> {
      const name = input.name.trim();
      if (name.length === 0) throw new Error('saved-search-name-required');
      return savedSearches.create(connection, {
        name,
        query: normalizeSearchQuery(input.query ?? ''),
        filters: sanitizeFilters(input.filters),
        sort: input.sort ?? 'updated_desc',
      });
    },
  };
}
