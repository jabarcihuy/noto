import type { SqliteExecutor, SqlValue } from '@/core/db/sqlite-port';
import type { CaptureType, Note } from '@/features/notes/domain/note';

import {
  buildFtsMatchExpression,
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  tokenizeSearchQuery,
  type SearchFilters,
  type SearchPage,
  type SearchRequest,
  type SearchResultItem,
  type SearchSort,
} from '../domain/search';
import { buildSnippet, SNIPPET_CLOSE, SNIPPET_OPEN } from '../domain/search-highlight';

/** Deterministic ordering: a stable `id ASC` tie-breaker closes every sort. */
const ORDER_BY: Record<SearchSort, string> = {
  updated_desc: 'n.updated_at DESC, n.id ASC',
  opened_desc: '(n.opened_at IS NULL) ASC, n.opened_at DESC, n.updated_at DESC, n.id ASC',
  created_desc: 'n.created_at DESC, n.id ASC',
  created_asc: 'n.created_at ASC, n.id ASC',
};

const NOTE_COLUMNS = `
  n.id AS id, n.title AS title, n.title_key AS title_key, n.content AS content,
  n.capture_type AS capture_type, n.notebook_id AS notebook_id, n.source_url AS source_url,
  n.created_at AS created_at, n.updated_at AS updated_at, n.opened_at AS opened_at
`;

type ResultRow = {
  id: string;
  title: string;
  title_key: string;
  content: string;
  capture_type: CaptureType;
  notebook_id: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  opened_at: string | null;
  fts_title?: string | null;
  fts_content?: string | null;
};

function rowToNote(row: ResultRow): Note {
  return {
    id: row.id,
    title: row.title,
    titleKey: row.title_key,
    content: row.content,
    captureType: row.capture_type,
    notebookId: row.notebook_id,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    openedAt: row.opened_at,
  };
}

function escapeLike(token: string): string {
  return token.replace(/[\\%_]/g, '\\$&');
}

function filterClauses(filters: SearchFilters | undefined, params: SqlValue[]): string[] {
  const clauses: string[] = [];
  if (!filters) return clauses;

  for (const tag of filters.tags ?? []) {
    clauses.push(
      'EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id AND t.name = ?)',
    );
    params.push(tag);
  }
  if (filters.notebookId != null) {
    clauses.push('n.notebook_id = ?');
    params.push(filters.notebookId);
  }
  if (filters.captureType != null) {
    clauses.push('n.capture_type = ?');
    params.push(filters.captureType);
  }
  // Provisional: inclusive boundaries on updated_at (see domain/date-range.ts).
  if (filters.dateFrom != null) {
    clauses.push('n.updated_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo != null) {
    clauses.push('n.updated_at <= ?');
    params.push(filters.dateTo);
  }
  return clauses;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(limit)));
}

function toItems(rows: ResultRow[], tokens: string[], fts: boolean): SearchResultItem[] {
  return rows.map((row) => {
    let snippet: string | null = null;
    let matchedIn: SearchResultItem['matchedIn'] = 'none';

    if (tokens.length > 0) {
      const ftsContent = row.fts_content?.trim() ?? '';
      const ftsTitle = row.fts_title?.trim() ?? '';
      if (fts && (ftsContent.length > 0 || ftsTitle.length > 0)) {
        if (ftsContent.length > 0) {
          snippet = row.fts_content ?? null;
          matchedIn = 'content';
        } else {
          snippet = row.fts_title ?? null;
          matchedIn = 'title';
        }
      } else {
        snippet = buildSnippet(row.content, tokens) ?? buildSnippet(row.title, tokens);
        const first = tokens[0]!.toLowerCase();
        matchedIn = row.content.toLowerCase().includes(first) ? 'content' : 'title';
      }
    }

    return { note: rowToNote(row), snippet, matchedIn };
  });
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

/**
 * Read-only search queries over the existing `notes` table (docs/DATABASE.md §6). When
 * FTS5 is available it uses `notes_fts`; otherwise it uses the documented `LIKE` fallback.
 * Both paths apply filters, ordering, and paging in SQL and never load the vault into JS.
 */
export function createSearchRepository() {
  async function run(
    db: SqliteExecutor,
    request: SearchRequest,
    fts: boolean,
  ): Promise<SearchPage> {
    const tokens = tokenizeSearchQuery(request.query);
    const limit = clampLimit(request.limit);
    const offset = Math.max(0, Math.floor(request.offset ?? 0));
    const orderBy = ORDER_BY[request.sort ?? 'updated_desc'];
    const params: SqlValue[] = [];

    let sql: string;
    const useFts = fts && tokens.length > 0;

    if (useFts) {
      params.push(buildFtsMatchExpression(tokens));
      const where = ['notes_fts MATCH ?', ...filterClauses(request.filters, params)];
      sql = `SELECT ${NOTE_COLUMNS},
                    snippet(notes_fts, 1, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', '…', 12) AS fts_title,
                    snippet(notes_fts, 2, '${SNIPPET_OPEN}', '${SNIPPET_CLOSE}', '…', 16) AS fts_content
               FROM notes_fts
               JOIN notes n ON n.id = notes_fts.note_id
              WHERE ${where.join(' AND ')}
              ORDER BY ${orderBy}
              LIMIT ? OFFSET ?`;
    } else {
      const where: string[] = [];
      if (tokens.length > 0) {
        for (const token of tokens) {
          where.push("(n.title LIKE ? ESCAPE '\\' OR n.content LIKE ? ESCAPE '\\')");
          const pattern = `%${escapeLike(token)}%`;
          params.push(pattern, pattern);
        }
      }
      where.push(...filterClauses(request.filters, params));
      sql = `SELECT ${NOTE_COLUMNS}
               FROM notes n
              ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY ${orderBy}
              LIMIT ? OFFSET ?`;
    }

    params.push(limit + 1, offset);
    const rows = await db.getAllAsync<ResultRow>(sql, params);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: toItems(pageRows, tokens, useFts),
      hasMore,
      engine: useFts ? 'fts5' : 'like',
    };
  }

  return {
    search(
      db: SqliteExecutor,
      request: SearchRequest,
      options: { fts5: boolean },
    ): Promise<SearchPage> {
      return run(db, request, options.fts5);
    },

    async countNotes(db: SqliteExecutor): Promise<number> {
      const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM notes');
      return Number(row?.count ?? 0);
    },

    /** Capture types actually present in the data, so the UI never offers empty options. */
    async listCaptureTypes(db: SqliteExecutor): Promise<CaptureType[]> {
      const rows = await db.getAllAsync<{ capture_type: string }>(
        'SELECT DISTINCT capture_type FROM notes ORDER BY capture_type ASC',
      );
      return rows.map((row) => row.capture_type as CaptureType);
    },
  };
}
