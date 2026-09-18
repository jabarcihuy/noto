# DATABASE — Noto

> Derived from `docs/PRD.md`. Defines how structured data is stored and how it relates.
> Binary files live on the filesystem; the database stores metadata and paths
> (PRD §13). Technical choices not fixed by the PRD are marked **Implementation Decision**.

## 1. Storage Split

| Data | Location | Authority |
| --- | --- | --- |
| Notes, tags, notebooks, links, templates, saved searches | SQLite | Source of truth |
| Attachments (image, audio, other) | Local filesystem | Binary source of truth |
| Attachment metadata, relative paths | SQLite | Source of truth for lookup |
| Structured vault index for import/export | `manifest.json` (generated) | Derived, portable |

The database is local and is never required to sync with a server (PRD §14, §15).

## 2. Conventions

- **Identifiers**: every row uses a client-generated `TEXT` primary key holding a UUID
  (v4). IDs are assigned at creation, never change, and are never reused. Links and
  attachments reference these IDs, which is what makes relationships rename-safe
  (PRD §10.3).
  - **Implementation Decision:** UUID v4 generated with `expo-crypto.randomUUID()`.
    The PRD requires stable identity but does not mandate an ID format.
- **Timestamps**: `TEXT` in ISO-8601 UTC, e.g. `2026-09-18T12:00:00.000Z`. Lexical order
  equals chronological order, so `ORDER BY` is safe.
- **Booleans**: `INTEGER` `0`/`1`.
- **Nullability**: empty optional values are `NULL`, not empty strings, except note
  `title`/`content`, which default to `''`.
- **Foreign keys**: enforced with `PRAGMA foreign_keys = ON` on every connection.
- **Transactions**: all multi-table writes run in a transaction (see §8).
- **Link state** is explicit: a link is `resolved`, `unresolved`, or `ambiguous` (§4.5).

## 3. Entity Relationships

```text
notebooks 1 ────< notes >──── 0..1 (note has at most one notebook)
notes     1 ────< note_tags >──── 1 tags
notes     1 ────< note_links (as source)
notes     0..1 ──< note_links (as target; optional = unresolved or ambiguous)
notes     1 ────< attachments
templates        (standalone; not referenced by notes)
saved_searches   (standalone; stores query + filter rules only)
app_metadata     (single key/value store)
pending_file_deletions (filesystem cleanup queue)
```

Key relationship decisions:

- A note has **exactly one or zero** notebooks (PRD §10.6).
- A note has **many** tags; a tag can belong to many notes (PRD §10.5).
- A note-link is directional (source → target). Backlinks are the reverse lookup, not a
  second stored row (PRD §10.4).
- A link target is optional. When it is absent, the link state distinguishes
  **unresolved** (no matching note) from **ambiguous** (several matching notes). Both
  are valid and neither is an error (PRD §10.2, §10.3).
- Notes do **not** reference templates. Templates are copy-on-create starting points
  (PRD §10.7).
- Saved searches store rules, never result copies (PRD §11.5).

## 4. Schema

### 4.1 `notebooks`

```sql
CREATE TABLE notebooks (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

- Notebooks are the top-level grouping (PRD §10.6).
- Names are not required to be unique by the PRD; the UI discourages duplicates.
- `sort_order` supports stable manual ordering.

### 4.2 `notes`

```sql
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
```

- `title` may be empty after capture (PRD §9.1). Empty titles are allowed and are not an
  error.
- `title_key` is the normalized title (NFKC + trim + collapse whitespace + lowercase),
  maintained by the note repository on every title change. It lets wikilink resolution
  match in SQL against an index instead of loading notes into memory.
  **Implementation Decision (Phase 1):** normalization lives in the data write path; an
  empty title yields `title_key = ''`.
- `content` is Markdown text containing optional wikilinks and attachment references
  (PRD §10.1, §7.2 of this document).
- `capture_type` records the origin of the note and backs the "capture type" filter
  (PRD §11.2). `mixed` covers notes that received multiple kinds of input.
  **Implementation Decision:** the origin value stays until the note genuinely gains a
  different kind of capture, at which point it becomes `mixed`. The filter matches the
  stored value.
- `source_url` holds the original URL for URL captures (PRD §9.4). It is metadata; note
  content remains the primary data.
- **Phase 10 URL capture** stores the URL in both `source_url` and (initially) `content`,
  so the note is valid offline and before metadata arrives. Fetched metadata is applied
  afterwards: title (only while it is still the default domain title), a description/
  domain block appended to content, and a preview image stored as a normal `attachments`
  row (`kind = 'image'`). No schema change was needed; no second URL/metadata store exists.
- `opened_at` backs "Recently Opened" sorting (PRD §11.3). It is updated when the note
  detail screen is opened.
  **Implementation Decision (Phase 2):** the update is throttled (at most once per 60 s
  per note) so reopening a note does not write on every focus, and editing content never
  touches `opened_at`.
- `ON DELETE SET NULL` on `notebook_id`: deleting a notebook never deletes notes
  (PRD §10.6).

### 4.3 `tags`

```sql
CREATE TABLE tags (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,          -- canonical: Unicode-lowercased, trimmed
  display_name TEXT NOT NULL,          -- first-seen casing, used for display
  created_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_tags_name ON tags(name);
```

- `name` is the uniqueness key. It is normalized (trim + Unicode lowercase) so casing
  differences do not create duplicate logical tags (PRD §10.5).
- `display_name` preserves the casing first used by the user.
- **Implementation Decision:** tags are derived from note content. There is no hidden
  tag state; the note body is the single source of truth (see the grammar and
  reconciliation rules below).

#### MVP tag grammar

Kept intentionally small; no namespaces or full Markdown parsing.

- A tag is `#` immediately followed by one or more allowed characters:
  `[A-Za-z0-9_-]` plus Unicode letters/digits (no whitespace, no punctuation).
- The `#` must be at the start of a line or immediately preceded by whitespace.
  This excludes URL fragments (`https://example.com#section`), `word#word`, and any
  `#` that is glued to non-whitespace.
- The tag ends at the first character outside the allowed set (whitespace or
  punctuation), which is not part of the tag.
- A `#` followed by whitespace is not a tag (for example the Markdown heading
  `# Title`).
- Tags inside **inline code spans** (`` `#tag` ``) are ignored.
- Tags inside **fenced code blocks** (``` or `~~~`) are ignored.
- Namespaces and nested tags (`#a/b`) are **not supported** in MVP. If required later,
  that is a product decision.
- Capitalization: identity is Unicode-lowercase + trim; the first-seen casing is shown.
  `#Java` and `#java` are one logical tag.

#### Tag reconciliation rules

- On note save, the use-case parses `content` into a set of canonical tag names and
  reconciles `note_tags` to exactly that set inside the same transaction as the note
  write (add missing assignments, remove assignments no longer present).
- Removing `#tag` from content removes the **assignment only**. It never deletes the
  `tags` row.
- Tags are **never deleted automatically**. Deleting a `tags` row is an explicit user
  action. A tag in use is never deleted.
- Global tag rename/delete management is an open product question
  (`ROADMAP.md` → Open Product Questions).

### 4.4 `note_tags`

```sql
CREATE TABLE note_tags (
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);
```

- Composite primary key prevents duplicate tag assignments.
- Deleting a note removes its assignments. Deleting a tag (explicit user action) removes
  its assignments.
- Reconciliation follows §4.3; assignments are derived from content.

### 4.5 `note_links`

```sql
CREATE TABLE note_links (
  id             TEXT PRIMARY KEY NOT NULL,
  source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  resolution     TEXT NOT NULL DEFAULT 'unresolved'
                 CHECK (resolution IN ('resolved','unresolved','ambiguous')),
  target_text    TEXT NOT NULL,   -- link target as written, normalized for matching
  display_text   TEXT,            -- optional alias from [[target|alias]]
  anchor         TEXT,            -- optional section/handle from [[target#section]]
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_note_links_source      ON note_links(source_note_id);
CREATE INDEX idx_note_links_target      ON note_links(target_note_id);
CREATE INDEX idx_note_links_target_text ON note_links(target_text);
```

This table is what makes wikilinks, backlinks, unresolved links, ambiguous links, and
rename safety work.

- **Source**: the note whose content contains `[[...]]`.
- **Target**: `target_note_id` is the resolved note, or `NULL` when the link is not
  connected.
- **`resolution`** records why a link is connected or not:
  - `resolved` — exactly one note matched `target_text`; `target_note_id` is set.
  - `unresolved` — no note matched `target_text`; `target_note_id IS NULL`.
  - `ambiguous` — several notes matched `target_text`; `target_note_id IS NULL` and the
    user must choose a target.
- **`target_text`**: the raw link target, normalized with the same rule as tag names
  (trim + lowercase), so `[[Java OOP]]` and `[[java oop]]` match the same title key.
- **`display_text` / `anchor`**: preserved from `[[target|alias]]` and
  `[[target#section]]` so Obsidian-style syntax survives import/export (PRD §12.4).
  Resolution matches only the part before `#` or `|`.
- **Deduplication**: **Implementation Decision:** one row per unique
  `(source_note_id, target_text, display_text, anchor)`. Repeated occurrences of the
  same link collapse into one relationship, but different aliases or anchors are kept as
  separate rows so import/export does not silently drop them. Backlink lists show each
  source note once.

**Title matching.** A note is matched by its stored normalized title key
(`notes.title_key`, trim + Unicode lowercase + whitespace collapse). A link's `target_text`
is compared against these keys.

**Link resolution rule (authoritative).**

1. Exactly one note matches `target_text` → `target_note_id` is set and
   `resolution = 'resolved'`.
2. Zero notes match → `target_note_id = NULL`, `resolution = 'unresolved'`
   (PRD §10.2).
3. More than one note matches → `target_note_id = NULL`, `resolution = 'ambiguous'`.
   The app **never** selects one automatically, and never falls back to the oldest note.
   The UI asks the user to choose; only that choice sets `target_note_id`.
4. Re-resolution runs only for rows where `target_note_id IS NULL` (`unresolved` and
   `ambiguous`). A row whose `target_note_id` is non-null is **never** re-pointed by
   title matching, even if a new note is later created with the old title.

**Relationship invariants.** These are invariants, not guidelines, and are enforced by
the use-case transaction plus tests (§10.14):

1. `resolution = 'resolved'` **iff** `target_note_id IS NOT NULL`.
2. `resolution IN ('unresolved','ambiguous')` **iff** `target_note_id IS NULL`.
3. A resolved link's `target_note_id` never changes except when its target note is
   deleted (which sets it to `NULL`).
4. Renaming a target note never changes any relationship; only `notes.title` changes.
5. Duplicate titles never cause an automatic choice.

**No cross-column `CHECK`.** `resolution` and `target_note_id` are deliberately **not**
tied by a SQL `CHECK`: SQLite evaluates a row `CHECK` after an `ON DELETE SET NULL`
foreign-key action, which would briefly set `target_note_id = NULL` while `resolution`
is still `'resolved'` and cause the delete to be rejected. Instead, the deleting use-case
sets incoming links to `NULL` and recomputes their `resolution` in the same transaction,
and the invariants above are verified by tests.

- **Rename safety** (PRD §10.3): relationships are anchored to `target_note_id`, so
  renaming the target note does not break existing links. The raw `target_text` in the
  source note may still read the old title; an optional "update link text" action can
  rewrite it, but correctness does not depend on it.
- **Deleting a target** relies on the existing `ON DELETE SET NULL` foreign key: incoming
  rows become `target_note_id IS NULL` again. The use-case recomputes their `resolution`
  (`unresolved` or `ambiguous`) in the same transaction. Source notes are never
  destroyed.

**Backlinks** (PRD §10.4) are computed, not stored:

```sql
SELECT n.* FROM note_links l
JOIN notes n ON n.id = l.source_note_id
WHERE l.target_note_id = ?;
```

**Unresolved and ambiguous links** are the rows where `target_note_id IS NULL`.
Unresolved links are surfaced as "create this note" opportunities; ambiguous links are
surfaced as "choose which note" and are not errors (PRD §10.2).

**Implementation (Phase 5).** One domain parser
(`src/features/links/domain/wikilink-parser.ts`) produces `target_text` / `display_text` /
`anchor`. Notes reconcile `note_links` inside the same transaction as create/update
through the `NoteLinkPort`, then call `resolveByTargetText(normalizedTitle)`, which runs
`resolveLinks` over rows where `target_note_id IS NULL` and `target_text = ?`
(`idx_note_links_target_text`). Because this only ever touches `NULL` targets, creating a
note or renaming a target can never re-point a resolved link. The ambiguous chooser and
unresolved "create note" actions both go through the link application use-cases; no UI
code writes `note_links` directly.

### 4.6 `attachments`

```sql
CREATE TABLE attachments (
  id            TEXT PRIMARY KEY NOT NULL,
  note_id       TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('image','audio','file')),
  relative_path TEXT NOT NULL,   -- relative to vault root, never absolute
  original_name TEXT,
  mime_type     TEXT,
  byte_size     INTEGER,
  width         INTEGER,          -- images
  height        INTEGER,          -- images
  duration_ms   INTEGER,          -- audio
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_attachments_note ON attachments(note_id);
```

- The binary lives on the filesystem; this table is the metadata record (PRD §13).
- `relative_path` is stored relative to the app's vault root so the vault can be moved
  and backed up (see ARCHITECTURE.md §6 and §7 of this document).
- Stored filenames are human-readable (sanitized from `original_name`) with a
  collision-safe suffix; see §7.1.
- Missing files are tolerated: the note still opens and the attachment renders as
  unavailable (PRD §18). Missing files never cause a note delete.

### 4.7 `templates`

```sql
CREATE TABLE templates (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  content     TEXT NOT NULL,
  is_builtin  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

**Implementation Decision:** the five built-in templates from PRD §10.7 (Fleeting Note,
Permanent Note, Idea, Meeting Note, Literature Note) are seeded by the app on first run
using stable IDs. Seeding is idempotent, so it never duplicates rows.

- **Implemented (Phase 8):** seeding uses `INSERT ... ON CONFLICT(id) DO NOTHING`, so a
  modified built-in row is preserved; a row the user deleted is re-inserted on the next
  startup (existing behavior, not a new product decision).
- **No note–template relationship:** `templates.id` is never stored on a note. Creating
  from a template copies `templates.content` into the new note inside the normal note
  create transaction; the note is independent from then on.

### 4.8 `saved_searches`

```sql
CREATE TABLE saved_searches (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  query       TEXT NOT NULL DEFAULT '',
  filters_json TEXT NOT NULL DEFAULT '{}',
  sort        TEXT NOT NULL DEFAULT 'updated_desc',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

- Stores only the rules, never result rows (PRD §11.5). Results are recomputed on open.
- `filters_json` carries `tag`, `notebook`, `date`, and `captureType` filters, matching
  PRD §11.2. Shape:

```json
{ "tags": ["programming"], "notebookId": "...", "dateFrom": "...", "dateTo": "...", "captureType": "text" }
```

- `sort` accepts `updated_desc`, `opened_desc`, `created_desc`, `created_asc`
  (PRD §11.3).
- **Implemented (Phase 7):** create and open/list. A saved search is recomputed on open
  from its stored rules; no result rows are ever persisted. Rename/reorder/delete/export
  remain an open product question (`ROADMAP.md`) and are not implemented.

### 4.9 `app_metadata`

```sql
CREATE TABLE app_metadata (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
```

Used for non-entity application state such as `schema_version`, `vault_id`,
`last_export_at`, and `onboarding_completed`. It is not a general settings store.

### 4.10 `pending_file_deletions`

```sql
CREATE TABLE pending_file_deletions (
  relative_path TEXT PRIMARY KEY NOT NULL,
  created_at    TEXT NOT NULL
);
```

- Cleanup queue for attachment files that must be deleted from the filesystem (§7.3).
- Rows are inserted in the same transaction that removes or unlinks an attachment, then
  the files are deleted best-effort and their rows removed. A startup/foreground sweep
  retries any leftovers.
- **Implementation Decision:** this table exists solely to make file cleanup recoverable
  across crashes; it is not a user-facing entity.

## 5. Indexes

| Index | Purpose |
| --- | --- |
| `idx_tags_name` (unique) | tag canonicalization / dedupe |
| `idx_note_tags_tag` | notes by tag |
| `idx_note_links_source` | rebuild/refresh links from a note |
| `idx_note_links_target` | backlinks by target note |
| `idx_note_links_target_text` | resolve unresolved/ambiguous links after create/rename |
| `idx_attachments_note` | attachments for a note |
| `idx_notes_title_key` | wikilink resolution by normalized title |
| `idx_notes_notebook_id` | notes per notebook |
| `idx_notes_updated_at` | recent / updated sort |
| `idx_notes_created_at` | newest / oldest sort |
| `idx_notes_opened_at` | recently opened sort |

**Implementation Decision (Phase 1):** the note-list/title indexes were added in the
initial schema because Phase 1 implements recent/list and wikilink resolution, which are
real query paths. Indexes that only serve speculative queries are still not added
(PRD §19 optimization is "based on real testing").

## 6. Full-text Search

**Implementation Decision:** search uses an FTS5 virtual table with an explicit
`note_id`, maintained by the application in the same transaction as note writes:

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'
);
```

- The app deletes and re-inserts a note's FTS row inside the note write transaction, so
  the index can never drift from `notes`.
- Search covers `title` and `content` (PRD §11.1) and works entirely offline.
- Tag and notebook filters are applied by joining `note_tags` / `notes`, not by adding
  them to the FTS index.
- Results are **paged** (fixed page size with a stable total order, e.g.
  `updated_at DESC, id ASC`). The app never loads the whole result set or the whole
  vault into memory (PRD §19).

### 6.1 FTS5 is a Phase 0 feasibility check

FTS5 is conceptually supported by SQLite, but availability depends on the SQLite build
shipped with the platform. It must **not** be assumed.

Phase 0 must verify, in the actual Expo runtime on the first target:

1. `CREATE VIRTUAL TABLE ... USING fts5(...)` succeeds.
2. Insert, update, and delete of an FTS row succeed.
3. `MATCH` returns expected results for title and content.
4. The `unicode61` tokenizer is present.
5. Behavior is consistent across app restarts.

The outcome is recorded in this document and in `ROADMAP.md` Phase 0. If FTS5 is
unavailable, the architecture must choose one of: require a build that includes it, or
define the fallback below as a supported mode of the same search feature.

**Phase 0 status (recorded).** FTS5 *semantics* were validated against a real SQLite
3.53.4 build (`node:sqlite`): table creation with `tokenize='unicode61'`, matching,
diacritic folding (`cafe` matches `café`), CJK token matching, row update, and row delete
all behaved as expected. The same checks are implemented for the device in
`app/phase0.tsx` / `src/phase0/db/sqlite-checks.ts`, but the **`expo-sqlite` Android
runtime has not yet been executed** in this environment (no emulator/device was
available). FTS5 availability on Android therefore remains **unconfirmed** until the
diagnostics screen runs on a device.

### 6.2 Fallback behavior and expected differences

If a supported platform lacks FTS5, the repository falls back to `LIKE` queries. The UI
does not branch, but the behavior differs and the differences are known:

| Aspect | FTS5 | `LIKE` fallback |
| --- | --- | --- |
| Matching | token/word based | substring based |
| Prefix / phrase / boolean | supported | not supported; literal substrings only |
| Ranking / relevance | available | none (deterministic sort only) |
| Case folding | via `unicode61` | SQLite `NOCASE` is ASCII-only; Unicode case folding is incomplete |
| Performance at 50k notes | acceptable | potentially slow; must be paged |

Search results are therefore "best available offline search" and the MVP does not promise
identical ranking across platforms. Any change to these semantics is a product decision
(PRD §27).

**Implementation (Phase 7).** Search lives in `src/features/search/` and reuses this
foundation; no second search database was introduced. The repository picks FTS5 or the
`LIKE` fallback from `database.capabilities.fts5` and never touches `notes_fts` on the
fallback path. User input is tokenized, each token is quoted and prefix-matched
(`"token"*`, AND-joined) so it cannot be interpreted as FTS syntax; the fallback escapes
`%`/`_` and uses `ESCAPE '\'`. Filters are applied by joining `notes` with `note_tags`/`tags`
(AND across selected tags) and by `notebook_id`, `capture_type`, and `updated_at`
comparisons. Ordering is applied in SQL with an `id ASC` tie-breaker. Paging fetches
`limit + 1` rows for `hasMore`, so the whole vault or result set is never loaded into JS.

## 7. Attachment File Storage

### 7.1 Layout and filenames

```text
vault/
├── attachments/
│   ├── photo.jpg
│   ├── photo-2.jpg
│   ├── voice-2026-09-18.m4a
│   └── report.pdf
└── ...
```

- Stored filenames are **human-readable** and derived from `original_name`:
  sanitize illegal/cross-platform characters, collapse whitespace, trim, keep the
  extension, and cap the length.
- Cross-platform safety: never assume the filesystem is case-sensitive; collisions are
  detected case-insensitively.
- Collisions are resolved deterministically by appending `-<n>` (or a short ID suffix if
  needed); the final name is stored once in `attachments.relative_path` and never
  changes.
- If `original_name` is missing or produces an empty name, fall back to
  `<attachment-id>.<ext>`.
- `relative_path` is `attachments/<stored-filename>` (vault-relative, never absolute).
- A file is written first, then its metadata row, both inside the use-case. If the row
  insert fails, the newly written file is queued/removed. If the file copy fails, no row
  is written.
- Voice notes record to a temporary file, then move it into the vault only when the user
  saves (PRD §9.3). Discarding a recording deletes the temp file.

**Implementation (Phase 6).** The vault root is the app-private document directory:
`Paths.document/vault`, so stored paths stay `attachments/<file>` and no absolute path
reaches the database. `FileSystemPort`'s vault methods (`copyIntoVault`, `deleteVaultFile`,
`vaultFileExists`, `listVaultDirectory`, `vaultUri`) are the only filesystem access used by
attachments. Filename sanitizing/collision (`buildStoredFilename`,
`resolveUniqueStoredFilename`) and reference building are pure domain code in
`src/features/attachments/domain/attachment-files.ts`. The attachment use-case verifies the
note exists, copies the file, then writes metadata and the content reference in one
transaction; a metadata failure deletes the file or queues it.

### 7.2 Attachment reference format in note content

Notes reference attachments with **standard Markdown and a vault-relative path**, so the
content remains usable outside Noto:

- Image: `![<alt text>](attachments/<stored-filename>)`
- Audio: `[<label>](attachments/<stored-filename>)`
- File: `[<label>](attachments/<stored-filename>)`

Mapping:

- The path after `](` is the vault-relative `attachments.relative_path`. The app resolves
  it against the vault root and finds the attachment by exact `relative_path`; it does not
  guess by title.
- A note can reference the same attachment more than once. Rendering uses the attachment
  `kind` to decide image vs. player vs. file row (FEATURES.md §8).
- If the referenced path has no matching `attachments` row, the reference is rendered as
  plain text and reported; the note is still editable and the surrounding content is
  never removed.
- If the matching row exists but the file is missing, the inline slot shows
  "This attachment is no longer available." (PRD §18).

Export:

- References are emitted **unchanged**. The export keeps `notes/` and `attachments/` at
  the vault root, so the vault-relative paths stay valid for Obsidian and other tools
  that resolve from the vault root.
- Single-note export uses the same reference strings. If the note has attachment
  references, the export warns that the `attachments/` sibling directory is required for
  the references to resolve (see §9.1).

### 7.3 Attachment deletion and reconciliation

Database and filesystem writes cannot share one transaction, so cleanup is explicit and
recoverable.

- **Normal delete (note or attachment):** inside the DB transaction, insert every file to
  be removed into `pending_file_deletions` (§4.10), then delete the metadata rows. After
  the transaction commits, delete the files and remove their queue rows.
- **DB deletion succeeds, file deletion fails:** the file remains but its queue row
  remains too. The startup/foreground sweep retries. The file is a known orphan, not a
  silent leak. Metadata is not resurrected.
- **File deletion succeeds, DB write fails:** the transaction rolled back, so the
  metadata row still exists and now points at a missing file. This is treated as a
  **missing file**: the note still opens, the attachment renders as unavailable, and the
  row is kept so the loss is visible and recoverable (PRD §18). The app never deletes the
  row automatically.
- **Orphan files** (files under `attachments/` with no `attachments` row and no queue
  row): detected by the sweep. **Implementation Decision:** the sweep does not silently
  delete unreferenced files. It reports them and quarantines them by listing them in the
  reconciliation report; only files that are provably from a failed write
  (`pending_file_deletions`) are deleted automatically.
- **Missing files** (rows with no file): detected and reported; never fatal; never
  cause note deletion.

**Reconciliation sweep** (runs at startup, after restore/import, and on demand from
Settings):

1. Process `pending_file_deletions` (retry deletions).
2. List `attachments/` and the DB paths; classify each entry as matched, orphan, or
   missing.
3. Report counts; repair only the safe cases. It never deletes user data that is
   referenced, and never auto-deletes ambiguous orphans.

### 7.4 Obsidian attachment mapping

- On import, Obsidian embeds/links such as `![[photo.jpg]]`, `[[photo.jpg]]`, or a
  relative path are resolved by **basename** against stored attachment filenames and
  `attachments.original_name`.
- If exactly one match exists, the reference is rewritten to the canonical
  `attachments/<stored-filename>` form (or, when the attachment row does not exist yet,
  the incoming file is imported as an attachment and then referenced).
- If several matches exist, the reference is treated as **ambiguous** and left as plain
  text with a conflict report; import does not silently guess.
- If no match exists, the reference is preserved verbatim as Markdown text; import never
  strips syntax it cannot resolve (PRD §12.4).
- Noto-specific canonical references that already point to `attachments/<stored-filename>`
  are preserved.

## 8. Migrations

- Version tracking uses SQLite's `PRAGMA user_version`.
- Migrations are an ordered list of `{ version, up(db) }` steps. On startup, the runner
  applies every step with `version > user_version` inside a single transaction per step,
  then sets `user_version`.
- Rules:
  - Migrations are **additive**: add columns/tables/indexes; never drop or rewrite user
    data.
  - A migration that cannot be expressed additively (e.g. changing a column's semantics)
    requires a documented data-migration step and must not silently discard values.
  - Refuse to open a database with `user_version` newer than the app knows, rather than
    attempting to downgrade.
  - Seed data (built-in templates) runs idempotently after migrations.
- No SQL outside the migration definitions and repositories is allowed
  (AGENTS.md §Architecture Rules).

## 9. Export / Import Data Structure

The vault layout is the portable representation of ownership (PRD §12.2):

```text
vault/
├── manifest.json
├── notes/
│   ├── Java Basics.md
│   └── Java OOP.md
└── attachments/
    ├── photo.jpg
    └── voice-2026-09-18.m4a
```

### 9.1 Note file format

Single-note export and full-vault export use **the same** note Markdown format: YAML
frontmatter plus body. Wikilinks, tags, and attachment references remain in the body so
the file is human-readable and Obsidian-compatible (PRD §12.1, §12.4):

```markdown
---
id: 9f1c...           # omitted for foreign imports without an ID
title: Java Basics
tags: [java, college]
notebook: Kuliah
captureType: text
sourceUrl: null
createdAt: 2026-09-01T10:00:00.000Z
updatedAt: 2026-09-10T09:30:00.000Z
---

Belajar Java berkaitan dengan [[Java OOP]].

![catatan](attachments/photo.jpg)
```

**File names.** Exported note files use a human-readable, sanitized title, not the note
ID:

- `notes/<sanitized-title>.md`; if the title is empty, `notes/Untitled.md` or
  `notes/Untitled-<short-id>.md`.
- Sanitize illegal/cross-platform characters, collapse whitespace, trim trailing dots
  and spaces, and cap the length.
- **Duplicate titles:** filenames must be unique. Deduplicate deterministically by
  appending ` (2)`, ` (3)`, … in a stable order (sorted by `createdAt`, then `id`).
  Deduplication compares case-insensitively to stay safe on case-insensitive
  filesystems. `manifest.json` maps `id → file`, so restore is exact regardless of the
  chosen filename.
- The stable note ID is always preserved in frontmatter, which is the identity key for
  restore.

**Single-note export** writes the same frontmatter and body to a user-chosen location. If
the note references attachments, the export indicates that the `attachments/` directory
is required for the references to resolve; it may offer to include them.

**Phase 4 note:** single-note export writes the note's real `tags` list and `notebook`
name through the shared serializer. A note with no tags/notebook emits `tags: []` and
`notebook: null`, which stay import-compatible.

### 9.2 `manifest.json`

```json
{
  "format": "noto-vault",
  "version": 1,
  "exportedAt": "2026-09-18T12:00:00.000Z",
  "notebooks": [{ "id": "...", "name": "Kuliah", "sortOrder": 0 }],
  "tags": [{ "id": "...", "name": "java", "displayName": "Java" }],
  "notes": [
    {
      "id": "...",
      "title": "Java Basics",
      "captureType": "text",
      "notebookId": "...",
      "sourceUrl": null,
      "createdAt": "...",
      "updatedAt": "...",
      "openedAt": "...",
      "file": "notes/Java Basics.md",
      "tags": ["java", "college"],
      "links": [
        {
          "targetText": "Java OOP",
          "targetNoteId": "...",
          "resolution": "resolved",
          "displayText": null,
          "anchor": null
        }
      ]
    }
  ],
  "attachments": [
    {
      "id": "...",
      "noteId": "...",
      "kind": "image",
      "file": "attachments/photo.jpg",
      "originalName": "photo.jpg",
      "mimeType": "image/jpeg",
      "byteSize": 120034,
      "width": 1080,
      "height": 1920,
      "durationMs": null
    }
  ],
  "templates": [],
  "savedSearches": []
}
```

- `manifest.json` makes restore exact. Without it, import still works from plain Markdown
  by deriving title, tags, wikilinks, and attachment references from the file
  (PRD §12.3, §12.4).
- Attachments are copied into the export and referenced by vault-relative path, so a
  vault folder or `vault.zip` is fully self-contained.
- Export reads from the database plus attachment files and never deletes source data
  (PRD §12.5). A failed export never leaves the user's live data altered.

### 9.3 Import behavior

- **Markdown / Obsidian import** (PRD §12.3, §12.4):
  - Parse frontmatter when present; otherwise derive the title from the first `# heading`
    or the filename.
  - Parse `#tags` from the body using the MVP grammar (§4.3) and `[[wikilinks]]`
    (including `|alias` and `#anchor` forms). Unsupported Obsidian syntax is preserved
    verbatim as Markdown text; import never strips information it cannot understand
    (PRD §12.4).
  - Attachments are resolved per §7.4.
  - If the file carries a `noto` `id` and that ID exists, treat it as a restore/update
    only when the user chose restore; otherwise create a new note with a new ID.
- **ID collision policy:** `id` is the identity key. Import must not silently overwrite an
  existing note.
  - Restore into the same vault: matching IDs update that note.
  - Foreign import / conflict: a new ID is generated and the imported note is kept
    alongside the existing one. The conflict is reported to the user (PRD §12.5).
- After notes are inserted, link resolution runs so internal wikilinks become connected,
  and ambiguous links are flagged rather than guessed (PRD §10.2, §4.5).
- After restore/import, the attachment reconciliation sweep runs (§7.3).

**Implementation (Phase 9).** Export and import live in `src/features/vault/` and reuse the
single note serializer; there is no second Markdown format. The vault layout is
`notes/<sanitized-title>.md`, `attachments/<stored-filename>`, and `manifest.json`, exactly
as above.

- **Manifest:** `format`, `version` (1), `exportedAt`, plus `notebooks`, `tags`, `notes`
  (with `file`, `tags`, and `links`), `attachments`, `templates`, and `savedSearches`.
- **Templates on import:** exported templates are recreated with their IDs, names,
  descriptions, content, and timestamps. Seeded built-ins are app policy, not user data:
  an identical built-in is skipped silently, while a collision with a user-created or
  user-modified template is reported and never overwritten.
- **Saved searches on import:** query, filters, and sort are recreated verbatim. An
  existing saved-search ID is reported and skipped (never overwritten); a same-named
  saved search with a different ID is imported alongside it. Importing either metadata
  kind never touches notes.
- **Attachment export** keeps the existing `relative_path`, so note references
  (`![…](attachments/…)`) resolve in the exported vault. A metadata row whose file is
  missing is recorded in the manifest and reported, but does not abort the export.
- **Export validation** runs before and after writing: duplicate note IDs or attachment
  paths block the export; every written note/attachment and the manifest are verified to
  exist. Export is read-only with respect to the live vault.
- **ZIP is not produced.** There is still no first-party archive API and no dependency was
  added; the Phase 0 documented fallback (folder export) is used, with an app-private
  fallback directory when a destination folder is not picked.
- **Unreferenced attachment files** in an imported folder are not copied into the vault
  (no note owns them) and are reported as `unreferenced-attachment:<path>` so the user
  knows they remain in the source; they are never silently discarded.
- **Conflict policy (provisional, non-destructive):** an imported note whose `id` already
  exists gets a **new ID**; an imported attachment whose `id` or path already exists gets a
  **new ID and a unique filename**; template and saved-search ID collisions are skipped and
  reported; all are reported. Nothing is overwritten, and no destructive "replace current
  vault" mode is implemented. This is the safe reading of §9.3 ("matching IDs update that
  note") until restore/replace semantics are decided.
- **Restore semantics:** restore is an **import into the current vault**, not a vault
  swap. A separate replace/restore mode remains future work.
- Files are copied into the vault before database writes; all note writes run in one
  transaction. On failure, copied files are deleted, or queued in `pending_file_deletions`
  when deletion fails, so the database never claims data whose files are missing.

## 10. Data Integrity Rules

1. IDs are immutable and never reused.
2. `PRAGMA foreign_keys = ON`; every connection enforces it.
3. Deleting a **note** removes its tag assignments, outgoing links, and attachment
   metadata, and queues its attachment files for deletion. Incoming links set
   `target_note_id = NULL` and their `resolution` is recomputed to `unresolved` or
   `ambiguous` in the same transaction (PRD §10.2, §4.5). Note deletion requires
   explicit user confirmation.
   - **Implementation Decision:** MVP performs a hard delete (the PRD does not specify a
     trash). Hard delete vs. trash is an open product question (ROADMAP.md).
4. Deleting a **notebook** sets `notes.notebook_id = NULL`; it never deletes notes
   (PRD §10.6).
5. Tag canonicalization prevents duplicate logical tags (PRD §10.5).
6. Tags are never deleted automatically (see §4.3). Removing a tag reference only removes
   the assignment.
7. A note may have at most one notebook and any number of tags.
8. `note_links.target_note_id` is either a real note or `NULL`; it is never a dangling ID.
9. `resolution = 'resolved'` if and only if `target_note_id IS NOT NULL`. This is
   maintained by the use-case transaction and enforced by tests, not by a cross-column
   `CHECK` (see §4.5).
10. Every multi-table write is transactional; FTS rows are updated in the same
    transaction.
11. Attachment metadata is only written after the file exists; a failed write queues or
    removes the file.
12. Attachment file cleanup is recoverable via `pending_file_deletions` and the
    reconciliation sweep (§7.3). Missing files and orphan files are reported, not
    silently deleted.
13. Import/restore never silently overwrites existing data (§9.3); conflicts are
    surfaced, including ambiguous attachment references.
14. Link invariants in §4.5 are enforced and must have tests: unique match resolves,
    zero matches is unresolved, multiple matches is ambiguous, and a resolved link is
    never re-pointed by title matching. A regression test must rename a target and then
    create a new note with the old title, asserting the original relationship is intact.
15. Timestamps are UTC ISO-8601 and monotonically updated by the use-cases, not by UI.
16. Diagnostics such as `PRAGMA integrity_check` and `PRAGMA foreign_key_check` are
    available for debugging and are not part of normal user flow.

## 11. Link and Data Invariants, and Open Questions

### 11.1 Guaranteed behavior (from this document)

- Stable IDs; relationships keyed by ID, never by title (PRD §10.3).
- Links are `resolved`, `unresolved`, or `ambiguous`; ambiguous is never auto-resolved
  (§4.5).
- Only unresolved/ambiguous links may be re-resolved; resolved links are frozen until
  their target is deleted (§4.5).
- Deleting a target makes incoming links unresolved/ambiguous; source notes are intact.
- Tags are content-derived, canonicalized, and never auto-deleted (§4.3).
- Attachment files and rows are reconciled; missing/orphan files are reported, never
  silently destroyed (§7.3).
- Single-note and vault exports share one format and preserve stable IDs (§9.1).

### 11.2 Open product questions

Product decisions not made by the PRD are collected in `ROADMAP.md` →
**Open Product Questions**. That list includes hard delete vs. trash, empty-note behavior,
date filter semantics, tag management, saved-search management, and duplicate-title UI
behavior. Database choices that depend on those answers (for example, adding a trash
state) must not be made until the product question is resolved through PRD §27.
