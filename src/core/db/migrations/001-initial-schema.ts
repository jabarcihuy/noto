import type { Migration } from './types';

/**
 * Initial schema (docs/DATABASE.md §4). Additive only; never edit after release.
 *
 * FTS5 is created when the runtime supports it (docs/DATABASE.md §6). If the runtime
 * lacks FTS5 the migration still completes and the app records `fts5: false`, which
 * selects the documented `LIKE` fallback. The search index is never silently replaced.
 */
export const migration001InitialSchema: Migration = {
  version: 1,
  name: 'initial-schema',
  async up(db) {
    await db.execAsync(`
      CREATE TABLE notebooks (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE notes (
        id           TEXT PRIMARY KEY NOT NULL,
        title        TEXT NOT NULL DEFAULT '',
        title_key    TEXT NOT NULL DEFAULT '',
        content      TEXT NOT NULL DEFAULT '',
        capture_type TEXT NOT NULL DEFAULT 'text'
                     CHECK (capture_type IN ('text','image','voice','url','file','mixed')),
        notebook_id  TEXT REFERENCES notebooks(id) ON DELETE SET NULL,
        source_url   TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        opened_at    TEXT
      );

      CREATE TABLE tags (
        id           TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at   TEXT NOT NULL
      );

      CREATE TABLE note_tags (
        note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id     TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (note_id, tag_id)
      );

      CREATE TABLE note_links (
        id             TEXT PRIMARY KEY NOT NULL,
        source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        target_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
        resolution     TEXT NOT NULL DEFAULT 'unresolved'
                       CHECK (resolution IN ('resolved','unresolved','ambiguous')),
        target_text    TEXT NOT NULL,
        display_text   TEXT,
        anchor         TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE attachments (
        id            TEXT PRIMARY KEY NOT NULL,
        note_id       TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL CHECK (kind IN ('image','audio','file')),
        relative_path TEXT NOT NULL,
        original_name TEXT,
        mime_type     TEXT,
        byte_size     INTEGER,
        width         INTEGER,
        height        INTEGER,
        duration_ms   INTEGER,
        created_at    TEXT NOT NULL
      );

      CREATE TABLE templates (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        content     TEXT NOT NULL,
        is_builtin  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE saved_searches (
        id           TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL,
        query        TEXT NOT NULL DEFAULT '',
        filters_json TEXT NOT NULL DEFAULT '{}',
        sort         TEXT NOT NULL DEFAULT 'updated_desc',
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE app_metadata (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE pending_file_deletions (
        relative_path TEXT PRIMARY KEY NOT NULL,
        created_at    TEXT NOT NULL
      );

      CREATE UNIQUE INDEX idx_tags_name          ON tags(name);
      CREATE INDEX idx_note_tags_tag             ON note_tags(tag_id);
      CREATE INDEX idx_note_links_source         ON note_links(source_note_id);
      CREATE INDEX idx_note_links_target         ON note_links(target_note_id);
      CREATE INDEX idx_note_links_target_text    ON note_links(target_text);
      CREATE INDEX idx_attachments_note          ON attachments(note_id);
      CREATE INDEX idx_notes_title_key           ON notes(title_key);
      CREATE INDEX idx_notes_notebook_id         ON notes(notebook_id);
      CREATE INDEX idx_notes_updated_at          ON notes(updated_at);
      CREATE INDEX idx_notes_created_at          ON notes(created_at);
      CREATE INDEX idx_notes_opened_at           ON notes(opened_at);
    `);

    try {
      await db.execAsync(
        "CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, content, tokenize = 'unicode61');",
      );
    } catch {
      // FTS5 unavailable in this runtime. The documented LIKE fallback is selected at
      // startup by probing for the notes_fts table.
    }
  },
};
