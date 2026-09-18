# FEATURES — Noto

> Derived from `docs/PRD.md`. Describes how each MVP feature behaves: normal behavior,
> important edge cases, and failure behavior. Nothing here may expand the MVP scope
> (PRD §22, §23). Technical choices are marked **Implementation Decision**.

The document follows the four feature groups in PRD §8:

1. Quick Capture
2. Linking & Organization
3. Search & Retrieval
4. Export & Data Ownership

Shared rules that apply to every feature:

- Everything works offline (PRD §14). No feature here requires an account or server.
- The primary data of an operation is saved before secondary work (metadata, previews,
  indexing) is attempted (PRD §18).
- Users are told what happened: saved, partially saved, or failed (PRD §17).
- Raw technical errors are never shown; they are translated into user-facing messages
  (PRD §18).

---

## 1. Quick Capture

The primary path into the app (PRD §9). No notebook or tag is required up front.

### 1.1 Text Capture

**Normal behavior**

- The user can open capture directly and type a title and content.
- `title` may be empty at capture time (PRD §9.1).
- Saving writes the note locally and immediately. No confirmation dialog is required.
- After save, the user can keep editing, add tags/notebook, or leave. The note is already
  durable.

**Edge cases**

- Empty title and empty content: the exact behavior is an **open product question**
  (`ROADMAP.md` → Open Product Questions). Until it is decided, the editor prevents an
  accidental empty save (Save disabled when both fields are empty) so no empty note is
  created; this is a provisional implementation choice, not a product decision.
- Very long content: saved as-is; no truncation.
- Duplicate titles: allowed; identity is the note ID, not the title (DATABASE.md §4.5).

**Failure behavior**

- If the local write fails, the note is not marked saved; the entered text stays on
  screen and a retryable message is shown. The editor must not lose user input on error.

### 1.2 Image Capture

**Normal behavior**

- The user chooses camera or gallery (PRD §9.2).
- The chosen image becomes an attachment on a note. If capture started with no note, a
  new note is created and the attachment is linked to it.
- The binary file is written to the local vault; the database stores metadata
  (DATABASE.md §4.6, §7).
- Multiple images may be attached to one note.

**Edge cases**

- Image capture with no note yet: a note is created with `capture_type = 'image'`.
- Large images: stored as provided; no processing/compression is part of MVP.
- Duplicate image selected twice: stored as two separate attachments.

**Failure behavior**

- Permission denied (camera): the feature explains that camera access is needed and
  offers gallery instead.
- File copy fails: no attachment metadata is written and the user is told the image was
  not added; the note itself remains valid.
- A previously saved attachment whose file is missing: shown as unavailable
  ("This attachment is no longer available."), note still opens (PRD §18).

### 1.3 Voice Note

**Normal behavior**

- The user can start recording, stop recording, play the result, save it, or delete it
  (PRD §9.3).
- Recording goes to a temporary local file; it enters the vault only on save.
- On save, an audio attachment is added to a note; a note is created if needed.
- Playback uses the platform audio player.

**Edge cases**

- Recording stopped with near-zero duration: offered for delete rather than saved as a
  broken file.
- Rotation/backgrounding during recording: recording state is preserved as far as the
  platform allows; if interrupted, the partial file is either recovered or discarded, but
  never saved as a corrupt attachment.
- Transcription is explicitly out of scope for MVP (PRD §9.3, §23).

**Failure behavior**

- Microphone permission denied: explain and provide a path to settings.
- Audio player unavailable/codec unsupported: show "cannot play this recording" and keep
  the file and metadata intact so it is not lost.

### 1.4 URL Capture

**Normal behavior**

- The user can save a URL. The note is created with `capture_type = 'url'` and stores the
  URL in `source_url` and/or content (PRD §9.4).
- After the URL is saved, the app may attempt to fetch title, description, domain, and
  preview image. Fetched metadata is additional, never required.
- A URL capture can later be opened in the system browser.

**Edge cases**

- Duplicate URL saved twice: allowed as separate notes; the app does not deduplicate.
- URL with no network / unreachable host: URL is still saved.
- Metadata succeeds after a delay: metadata is applied when it arrives; the note is
  already durable and editable.

**Failure behavior**

- Metadata fetch fails or times out: show "The link was saved, but its preview could not
  be loaded." (PRD §18). The URL and note are unaffected.
- Malformed URL: saved as plain text with `capture_type = 'text'` and the user is told it
  was not recognized as a link.

**Implemented (Phase 10)**

- Home offers "Simpan tautan" opening capture in URL mode. The URL is validated
  (`http`/`https` only); anything else is saved as a plain text note and the user is told
  it was not recognized as a link.
- The note is created first with `capture_type = 'url'` and `source_url`, and its content
  is the URL itself, so it is useful offline and without metadata.
- Metadata (OpenGraph/Twitter/`<title>`, description, domain, preview image) is fetched
  afterwards with an 8 s timeout and a 512 KB cap. Failure/timeout/offline leaves the note
  untouched and reports "Tautan tersimpan, tetapi preview belum tersedia."
- **Implementation Decision:** metadata never overwrites a user-entered title. It fills the
  title only while the title is still the default domain-derived value. The description is
  appended once; the URL is never duplicated.
- A preview image is downloaded through the normal attachment pipeline
  (`attachments.addImageFromUrl`) so export/import and reconciliation treat it like any
  other attachment; a failed download is non-fatal.
- The parser extracts only a few fields with regexes; no HTML is executed, evaluated, or
  injected into the UI. `source_url` remains the single URL storage field.

### 1.5 Share Input

**Normal behavior**

- The app can receive content shared from other apps via the platform share mechanism
  (PRD §9.5): text, URL, image, or file.
- The received payload is routed into the matching capture flow:
  - text → text capture;
  - URL → URL capture;
  - image → image capture;
  - file → attachment capture.
- The user can review before saving; share input does not have to save silently.

**Edge cases**

- Multiple items shared at once: each is handled in order (or attached to one note when
  they are files/images of the same share).
- Share arrives while the app is closed: it opens the correct capture flow on launch.
- Unsupported MIME type: treated as a generic file attachment when possible; otherwise the
  user sees a clear "this content type is not supported yet" message.

**Failure behavior**

- Payload cannot be read/copied: tell the user the shared item could not be imported and
  leave all other data untouched. Never create an empty note silently.
- Share integration unavailable on a platform (e.g. Web): the capture flows remain
  available manually (ARCHITECTURE.md §9). This is graceful degradation, not an error.
- Implementation note (Phase 0): receiving shares is first-party via `expo-sharing`
  (`getSharedPayloads()` + its config plugin for Android intent filters), so no
  third-party module is needed. It requires a development/standalone build, not Expo Go
  (ARCHITECTURE.md §8).

**Implemented (Phase 10)**

- A root-level listener (`useShareListener`) polls the platform queue on mount and on
  `AppState` active, resolves content URIs, clears the platform queue, and hands the batch
  to a small in-memory store. The listener never saves silently: it opens the capture
  screen for review.
- Payload routing reuses the existing flows: text → text capture; text/URL containing a URL
  → URL capture (same metadata logic as manual entry); image → image attachment; audio →
  audio attachment; generic files and video are rejected with a clear message and create no
  note. Unreadable payloads report a failure without creating an empty note.
- Deduplication compares the payload batch key with the last handled batch and clears the
  platform queue, so cold-start/warm-start intent redelivery does not duplicate captures.
- Share receiving requires a development/standalone build; on Expo Go/Web the listener is
  inactive and manual capture still works. **Android runtime is unverified.**

---

## 2. Notes

### 2.1 Create

- A note can be created from Quick Capture, from a wikilink, from a notebook, or from a
  template.
- Creation requires no notebook or tag (PRD §6.1).
- A stable ID is assigned at creation (DATABASE.md §2).

### 2.2 Read

- Opening a note renders its title and Markdown content, its tags, its notebook, its
  attachments, and its backlinks (PRD §10.4).
- Opening updates `opened_at` for "Recently Opened" (DATABASE.md §4.2). The update is
  throttled; rapid re-opens do not write every time.
- Wikilinks render as links. Resolved links navigate to the target note. Unresolved links
  offer to create the target (PRD §10.2). Ambiguous links (several matching titles) are
  shown as needing a choice and never navigate to a guessed note (DATABASE.md §4.5).

### 2.3 Edit

- Editing is direct and autosaves; an explicit Save action is also available. The save
  trigger is defined in UX_FLOW.md; in all cases the note must not be lost on navigation
  or error.
- **Implemented (Phase 3):** title/content edit with a debounced autosave (~800 ms), an
  explicit Save, four visible save states (`saved`, `saving`, `unsaved`, `error`), and a
  flush when leaving the screen. Autosave always persists the latest value and never lets
  a slower older write overwrite newer content. Leaving after a failed save asks for
  confirmation instead of silently discarding input.
- Editing never changes the note ID, `created_at`, or `opened_at`.
- Content is saved verbatim. **Implemented (Phase 4/5):** tags and wikilinks are re-parsed
  from content inside the note write transaction; the text itself is still saved verbatim.
- Removing an attachment reference from content removes only the reference; attachment
  metadata/file cleanup is handled explicitly (see §8 and DATABASE.md §7.3).

### 2.4 Delete

- Deleting requires explicit confirmation (DATABASE.md §10.3).
- Delete removes the note, its tag assignments, its outgoing links, and its attachment
  metadata, and queues its attachment files for filesystem cleanup (DATABASE.md §7.3).
  Links from other notes to this note become unresolved or ambiguous rather than broken
  (PRD §10.2).
- Undo is not part of MVP. **Implementation Decision:** show a final confirmation that
  names the note; this is the safety mechanism.
- Hard delete vs. trash is an **open product question** (`ROADMAP.md` → Open Product
  Questions). MVP behavior is hard delete with confirmation.

### 2.5 Note metadata

- Title, content, notebook, tags, capture type, timestamps, source URL, attachments.
- Metadata helps retrieval but never blocks capture (PRD §6.3).

---

## 3. Linking

### 3.1 Wikilink creation

- Syntax `[[Nama Catatan]]` typed in content (PRD §10.1).
- Optional alias `[[Target|Display]]` and anchor `[[Target#Section]]` are preserved
  (DATABASE.md §4.5).
- A link can be created before the target exists (PRD §10.2). This is valid, not an error.
- If several notes share the link target, the link is **ambiguous** and the user chooses
  the target; the app never picks one automatically (DATABASE.md §4.5).
- **Implemented (Phase 5):** a single domain parser
  (`src/features/links/domain/wikilink-parser.ts`) is shared by the editor, reader, and
  reconciliation. The editor shows debounced suggestions for an unterminated `[[query`,
  querying the indexed `notes.title_key` by prefix; choosing one inserts only the
  `[[Title]]` token. Aliases and anchors are preserved as separate relations.

### 3.2 Link resolution

A link has one of three states (DATABASE.md §4.5):

- **Resolved** — exactly one note matches the normalized title. The link points at that
  note.
- **Unresolved** — no note matches. The link is valid and offers "create this note"
  (PRD §10.2).
- **Ambiguous** — several notes match. The link stays disconnected and the user is asked
  to choose; the app **never** selects the oldest or any other note automatically.

Rules:

- Re-resolution runs only for links that are not connected (unresolved or ambiguous).
- A resolved link is never re-pointed by title matching, even if a note with the old
  title is created later. Renaming a target never changes existing relationships
  (PRD §10.3).
- If the target is deleted, incoming links return to unresolved/ambiguous according to
  the database foreign-key behavior (DATABASE.md §4.5).
- **Implemented (Phase 5):** note create/update reconcile `note_links` in the same
  transaction (a `NoteLinkPort`, mirroring tags). After a create or rename,
  `resolveByTargetText` resolves only rows whose `target_note_id IS NULL`; resolved links
  are never re-pointed. A user-chosen target for an ambiguous link is written through
  `resolveLink` and does not touch note content.

### 3.3 Rename safety

- Renaming a note keeps all incoming relationships pointing at the same note ID
  (PRD §10.3).
- The visible link text in source notes is not automatically rewritten unless the user
  chooses to; correctness does not depend on it.
- **Implemented (Phase 5):** the relationship is anchored to `target_note_id`, which is
  only ever set by a unique initial match or an explicit user choice. Renaming the target
  and later creating a note with the old title leaves the original relationship intact;
  this is covered by a regression test.

### 3.4 Unresolved links

- Shown distinctly (e.g. dimmed/broken styling) but not as an error (PRD §10.2).
- The UI offers "create note" from an unresolved link. Creating it resolves all links
  that pointed to that title.
- Ambiguous links are shown as needing a choice; the user picks the target, and only
  that choice connects the link. Ambiguous is not an error.
- A deleted target makes incoming links unresolved/ambiguous again; information in source
  notes is never destroyed.
- **Implemented (Phase 5):** note detail renders resolved links with accent styling and
  unresolved/ambiguous links dimmed or in the warning color. Tapping unresolved offers
  "Buat catatan"; tapping ambiguous opens a chooser that lists candidates by title,
  notebook, and updated date. No candidate is ever chosen automatically.

**Failure behavior**

- If link re-resolution fails mid-save, the note content is still saved; links remain as
  they were and are re-resolved on the next successful pass. The user is not shown a raw
  error.

### 3.5 Backlinks

- The note detail shows the list of notes that reference the current note (PRD §10.4).
- Backlinks are computed from `note_links`, never stored as duplicated data.
- A backlink entry opens the source note.
- If a source note is deleted, it disappears from backlinks (cascade).
- **Implemented (Phase 5):** the detail screen renders a "Backlink" section at the bottom,
  with a quiet empty state. Each source note appears once even when it links with several
  aliases or anchors.

---

## 4. Tags

**Normal behavior**

- A note can have many tags (PRD §10.5). Tags are written inline in content as `#tag`
  and shown as chips in the editor.
- Tags power classification, filtering, and retrieval.
- Casing differences do not create duplicates: `#Java` and `#java` are one logical tag;
  the first-seen casing is displayed (DATABASE.md §4.3).

**Tag grammar (MVP, simplified)**

- A tag is `#` immediately followed by `[A-Za-z0-9_-]` (plus Unicode letters/digits).
- The `#` must start a line or follow whitespace, which excludes URL fragments and
  `word#word`.
- A `#` followed by whitespace is not a tag (for example a Markdown heading).
- `#` inside inline code spans and fenced code blocks is ignored.
- Namespaces (`#a/b`) and nested tags are not supported in MVP.

The precise rules live in DATABASE.md §4.3; domain parsing is unit-tested against them.

**Reconciliation**

- Note content is the single source of truth for inline tags; there is no hidden tag
  state.
- On save, content is parsed into a set of canonical tags and `note_tags` is reconciled
  to exactly that set.
- Removing `#tag` from content removes the assignment only, never the `tags` row.
- **Implemented (Phase 4):** the domain parser (`parseTags`) follows the grammar above and
  the note create/update use-cases reconcile tags inside the same transaction. Adding a
  tag from the UI appends a `#tag` token to content; removing one strips its token(s) and
  re-reconciles. There is no separate tag store.

**Tag UI (Phase 4)**

- Note detail shows the note's tags as chips and links to a tag screen.
- The tag screen lists the note's tags (tap to remove), lets the user add a tag, and lists
  available tags to add. Global rename/merge/delete is not implemented (open question).

**Edge cases**

- Tag with only whitespace / empty: ignored.
- Global tag rename/delete is an **open product question** (`ROADMAP.md` → Open Product
  Questions). Removing a tag from one note never deletes the tag globally.
- Tags are never deleted automatically; a tag in use is never deleted (DATABASE.md §4.3).

**Failure behavior**

- If a tag write fails, the note content is still saved; the tag is reported as not
  applied. No partial tag state is shown as saved.

---

## 5. Notebooks

**Normal behavior**

- A notebook groups notes at the top level (PRD §10.6).
- A note has zero or one notebook.
- **Implemented (Phase 4):** create, rename, delete, and browse notebooks; open a notebook
  to see its notes; assign a note to a notebook or set it to "no notebook".
- **Not implemented:** notebook reordering and note counts (not required by the PRD; the
  schema keeps `sort_order` for later).

**Edge cases**

- Deleting a notebook does not delete notes; notes become unassigned (PRD §10.6,
  DATABASE.md §10.4).
- Two notebooks with the same name are allowed (name uniqueness is a UI concern).

**Failure behavior**

- If a note move fails, the previous notebook assignment is kept and the user is told the
  move did not happen.

---

## 6. Templates

**Normal behavior**

- Built-in templates: Fleeting Note, Permanent Note, Idea, Meeting Note, Literature Note
  (PRD §10.7).
- Choosing a template pre-fills the note content (the schema stores `name`, `description`,
  and `content`; there is no separate template title); the user can edit everything before
  or after saving.
- A note created from a template has no ongoing dependency on it; editing or deleting the
  template does not affect existing notes.

**Edge cases**

- Empty template: creates an empty note (same as text capture).
- **Implementation Decision:** custom user templates are not part of the MVP; only the
  built-ins are required by PRD §10.7. The schema allows user templates later without
  migration changes beyond seeds.

**Failure behavior**

- Missing built-in template (seed not applied): the create flow falls back to an empty
  note and surfaces a non-blocking message.

**Implemented (Phase 8)**

- The five built-ins are seeded by the database boundary with stable IDs; the app exposes
  a read-only Templates screen (`app/templates.tsx`) listing them, reached from Home
  ("Dari template") and Settings ("Template").
- Selecting a template opens the existing capture screen with the template content
  pre-filled and a small "Template: <name>" indicator. Nothing is saved by selecting;
  the user edits and taps Save, which calls the existing note create use-case.
- The note copies the template content at creation time and keeps no `template_id` or
  other ongoing relationship. Editing or deleting the template cannot affect the note.
- Template content flows through the existing tag and wikilink reconciliation because it
  is written by the normal note create transaction; no template-specific organization or
  link system exists.
- **CRUD scope:** list and read only. Custom template management remains out of MVP scope
  (see the Implementation Decision above), so no template editor, delete action, folders,
  tags, sharing, sync, or analytics were added.
- An empty template leaves Save disabled until the user types (same rule as empty text
  capture). A missing template shows a non-blocking message and an empty note form.
- **Seeding behavior (unchanged):** seeding is idempotent and never overwrites a modified
  built-in, but a deleted built-in row is re-inserted on the next startup. This is the
  existing Phase 1 behavior; whether deletion should be permanent is not decided here and
  is reported as an open issue (`ROADMAP.md` → Phase 8 findings).

---

## 7. Search & Retrieval

### 7.1 Full-text Search

- Searches title and content (PRD §11.1), entirely offline.
- Results update as the query changes; a query returns note previews (title, snippet,
  matched terms highlighted) and opens the note on tap.
- No semantic search in MVP (PRD §11.1, §23).

**Edge cases**

- Empty query: shows recent/browse state rather than all notes.
- Special characters: treated as literal text; query is not sent as raw FTS syntax
  without escaping.
- Very common terms / large result sets: paged/limited, never loading the whole vault
  (PRD §19).

**Failure behavior**

- If the FTS engine is unavailable and the fallback query fails, show a retryable error
  and keep filters intact. Search failure never affects stored notes.
- A stale index is avoided by updating FTS in the note write transaction
  (DATABASE.md §6).

### 7.2 Filters

- Minimal filters: tag, notebook, date, capture type (PRD §11.2).
- Filters combine with a text query and with each other.
- Active filters are visibly represented and individually removable.

**Edge cases**

- A filter that matches nothing: show a clear empty state with a way to clear filters.
- Date filter boundaries are inclusive. Which timestamp is filtered (created vs updated)
  is an **open product question** (`ROADMAP.md` → Open Product Questions); no default is
  finalized yet.
- Multiple tags: **Implementation Decision:** AND semantics (note must have all selected
  tags), which is the least surprising for narrowing.

### 7.3 Sorting

- Options: Recently Updated, Recently Opened, Newest, Oldest (PRD §11.3).
- Sorting applies to lists and search results and stays applied while filtering.

### 7.4 Recent

- Recent surfaces notes recently created, edited, or opened (PRD §11.4).
- It is a simple chronological view, not a recommendation system.
- Home shows Quick Capture plus recent notes only; it is not a statistics dashboard
  (PRD §16).

### 7.5 Saved Search / Smart Collection

- Users can save a query plus filters plus sort under a name (PRD §11.5).
- Opening a saved search recomputes results from current data; no result copies are stored.
- Whether saved searches can be renamed, reordered, or deleted (and whether they can be
  shared/exported) is an **open product question** (`ROADMAP.md` → Open Product
  Questions). Create/open behavior is defined; management beyond that is not finalized.
- A saved search references filters by value (tag names, notebook ID, type), so it stays
  useful as data changes.

**Failure behavior**

- If a saved search references a deleted notebook or tag, it opens showing the remaining
  valid filters and indicates the stale one can be cleared; it never crashes.

**Implemented (Phase 7)**

- Search runs in `src/features/search/`: FTS5 when the runtime provides it, otherwise the
  documented `LIKE` fallback. The screen shows a limited-mode notice when degraded, and
  the query layer reports which engine ran.
- Query text is split into literal tokens; each is quoted and prefix-matched and combined
  with AND. No boolean/phrase syntax is interpreted and special characters are literal.
- Results show the note title, a highlighted snippet (or a content preview for browse),
  and the updated time; tapping opens the existing note detail screen.
- Filters: tag (normalized identity, AND across selected tags), notebook (by ID), capture
  type (only values present in the data), and date presets (Hari ini / 7 / 30 hari).
  Filters combine with the query and each other, are removable individually, and have a
  clear-all action.
- **Provisional:** the date filter uses `updated_at` with inclusive boundaries. The
  created-vs-updated / inclusivity question is still open; this is reported, not resolved.
- Sorting: Terbaru diperbarui, Terbaru dibuka, Terbaru dibuat, Terlama, with a stable ID
  tie-breaker; applied in SQL. Results page 25 at a time with a "Muat lagi" action.
- Saved searches: create from the current query/filters/sort and open to recompute.
  Rename/reorder/delete/export remain open and are not implemented.
- Empty states distinguish "no notes yet", "no query match", and "no filter match";
  errors keep the query and filters and offer retry; loading shows an in-progress state.
- **No dependency** was added; search uses the existing SQLite/expo-sqlite stack.

---

## 8. Attachments

**Normal behavior**

- Attachments belong to a note; kinds are image, audio, and file (PRD §13,
  DATABASE.md §4.6).
- Displayed in the note: images inline/thumbnail, audio with a player, other files with
  name/type/size and an open action.
- Stored as local files with metadata in SQLite (PRD §9.2, §13), with human-readable,
  collision-safe filenames (DATABASE.md §7.1).
- Notes reference attachments with standard Markdown and a vault-relative path:
  `![alt](attachments/file.jpg)` or `[label](attachments/file.ext)`
  (DATABASE.md §7.2). The reference stays usable outside the app.
- Adding an attachment inserts its reference into the note content and creates the
  metadata row in the same use-case.

**Edge cases**

- Many attachments on one note: list stays performant; images are not all decoded at once.
- Attachment added after note creation changes a note's effective content kind; the
  origin `capture_type` handling is documented in DATABASE.md §4.2.
- Duplicate attachments are allowed; filenames are made unique at storage time.
- A reference whose attachment row is missing renders as plain text and is reported; the
  note is not corrupted.
- Obsidian `![[name]]` references are mapped by basename; multiple matches are reported
  as ambiguous and not guessed (DATABASE.md §7.4).

**Failure behavior**

- Missing file: "This attachment is no longer available."; note still opens (PRD §18).
  The metadata row is kept so the loss is visible and recoverable via restore; it is never
  deleted automatically.
- Delete cleanup is recoverable: the system distinguishes "DB deleted / file remains"
  (orphan, retried via a queue) from "file deleted / DB remains" (missing, reported). The
  reconciliation sweep reports orphans and never silently deletes unreferenced files
  (DATABASE.md §7.3).
- Unsupported file to open: offer share/export instead of failing silently.

**Implemented (Phase 6)**

- Image: gallery selection and camera capture via `expo-image-picker`, invoked from note
  detail. The file is copied into the vault under `attachments/` before its metadata row
  is written; the content gains an `![alt](attachments/<file>)` reference. Name collision
  suffixing is case-insensitive and deterministic.
- Voice: `app/note/[id]/record.tsx` records to a temporary file (start/stop/discard/save),
  previews playback before saving, then copies the temp file into the vault and adds a
  `[label](attachments/<file>)` reference. Discarding deletes the temp file.
- Playback uses one controlled player per note screen; leaving the screen releases it.
  Record and play controls are text-labelled (not color-only).
- A file that is missing renders as "Lampiran ini sudah tidak tersedia." with a delete
  action; the note opens normally and other attachments still render.
- Failure safety: a failed copy writes nothing; a metadata failure after a successful copy
  deletes the file, or queues it in `pending_file_deletions` when that also fails. Delete
  queues the file in the same transaction as the metadata delete and retries.
- Reconciliation runs at startup and from Settings (Periksa lampiran) and reports
  matched/missing/orphan/pending counts; orphans are reported, never auto-deleted.
- Only the expected image/audio formats are supported in this phase; no OCR, transcription,
  image processing, or file picker beyond image/audio was added.
- **Implementation Decision:** gallery access is best-effort on Android. The system photo
  picker grants per-item access, so a denied media-library permission does not block the
  picker; camera and microphone permissions are gated explicitly, with an Open Settings
  path when the user must change it.

---

## 9. Export & Data Ownership

### 9.1 Single-note Markdown Export

- Exports one note as `.md`, preserving title, content, and the documented metadata
  (PRD §12.1, DATABASE.md §9.1).
- Uses the **same** note file format as full-vault export: YAML frontmatter (including
  the stable note ID) plus body (DATABASE.md §9.1). There is no second format.
- The exported file is named from the sanitized note title, not the ID. An empty title
  falls back to `Untitled-<short-id>.md` (DATABASE.md §9.1).
- The file is created in a private export directory and offered through the platform share
  sheet so the user chooses the destination. If sharing is unavailable, the file is still
  written and the user is told sharing was not available.
- Tags and notebook are written from the note's actual data: `tags: [...]` and
  `notebook: <name>` (DATABASE.md §9.1).
- If the note references attachments, the UI warns that the export contains only the
  Markdown file and not the attachment files (DATABASE.md §7.2, §9.1).
- Export only reads the note. It never modifies the note or the database.

**Failure behavior**

- If export fails, the user is told the export failed and that the note is safe, and can
  retry. Export never mutates source data.

### 9.2 Full Vault Export

- Exports all notes, attachments, and a `manifest.json` into a folder or `vault.zip`
  (PRD §12.2).
- Uses the same note format and human-readable filenames as single-note export
  (DATABASE.md §9.1); `manifest.json` maps note IDs to files for exact restore.
- The result is self-contained and can be used for backup and restore.
- Export is read-only with respect to live data.

**Edge cases**

- Large vault: export streams files; progress is shown; the app remains usable.
- Missing attachment file: export records the metadata and notes the missing file in the
  report rather than aborting the whole export.
- Destination has no free space / permission denied: show a clear error and leave the
  existing vault untouched.

### 9.3 Markdown / Obsidian Import

- Import a single Markdown file or a folder (PRD §12.3).
- Content is preserved as much as possible. Obsidian wikilinks, tags, and attachments are
  supported at a basic level (PRD §12.4).
- Unsupported Obsidian syntax is preserved verbatim as Markdown; import never deletes
  information it cannot interpret.
- Attachment references are resolved by basename (Obsidian `![[name]]`, `[[name]]`, or
  relative paths). A unique match is linked; multiple matches are reported as ambiguous
  and left as text; no match preserves the raw reference (DATABASE.md §7.4).
- Imported markdown without a Noto ID gets a new note; matching IDs are handled by the
  collision policy (DATABASE.md §9.3).
- After import, link resolution runs so internal wikilinks connect, ambiguous links are
  flagged, and the attachment reconciliation sweep runs (PRD §10.2, DATABASE.md §7.3).

**Failure behavior**

- Partially readable folder: import what can be imported and report skipped files with
  reasons; never fail the whole operation silently or delete existing data.
- Destination conflicts: never overwrite existing notes without explicit user choice
  (PRD §12.5).

**Implemented (Phase 9)**

- Full vault export writes `notes/`, `attachments/`, and `manifest.json` to a picked
  folder, or to an app-private fallback folder when picking is unavailable. The same
  `serializeNoteMarkdown` serializer as single-note export is used; no second format.
- **Templates and saved searches round-trip:** exported templates and saved searches are
  recreated by import (IDs, names, descriptions, content, query, filters, and sort).
  Identical seeded built-ins are skipped silently; ID collisions with user data are
  reported and skipped, never overwritten. Importing them never touches notes.
- **Unreferenced attachment files** in an imported folder are reported
  (`unreferenced-attachment:<path>`) and left in the source; they are not copied without a
  referencing note and are never silently discarded.
- Import supports one Markdown file and a folder/vault. It parses the documented
  frontmatter, falls back to the first `# heading` then the filename, merges frontmatter
  tags into content, resolves Obsidian/relative attachment references by unique basename,
  and preserves unresolvable references verbatim with a report.
- **Conflict behavior is non-destructive and provisional:** colliding note IDs and
  attachment IDs/paths get new local identities and are reported; nothing is overwritten.
- **Restore is import into the current vault.** A destructive replace/restore mode is not
  implemented; the word "restore" in this document means re-importing a backup.
- Failure safety: files are copied before database writes, all note writes are one
  transaction, and a failure removes the copied files (or queues them) so the app never
  reports success with missing files.
- Export is read-only: it never changes notes, timestamps, links, tags, or attachments.
- ZIP (`vault.zip`) is not produced yet: no first-party archive API exists and no archive
  dependency was added; folder export is the documented fallback.

### 9.4 Local File Backup / Restore

- A local folder can be a backup destination, a restore source, and the basis for future
  sync (PRD §12.5).
- Restore of a vault reuses the import pipeline.
- MVP does not implement complex conflict resolution. When a conflict cannot be resolved
  safely, the app must not overwrite data silently (PRD §12.5).

**Implemented (Phase 9).** Restore = re-import into the current vault (see §9.3). A
destructive "replace the vault" workflow is not implemented, and the app never wipes the
current data before validating an imported archive.

**Failure behavior**

- Interrupted backup/restore: the live database is never left half-written; restore is
  transactional per note batch, and the user gets a report of what was applied.

### 9.5 Share Output

- Notes/vault exports may be shared out through the platform share sheet where available.

---

## 10. Cross-Cutting Behavior

### 10.1 Offline

All MVP features in this document work without internet, including capture, editing,
linking, backlinks, tags, notebooks, search, filters, sorting, recent, saved searches,
attachments, local import/export, and restore (PRD §14). Only URL metadata fetch benefits
from network and is allowed to fail harmlessly.

### 10.2 Privacy

No login, account, profile, or required backend (PRD §15). Note content is not sent to an
external service unless a feature explicitly requires it; in MVP the only network use is
URL metadata for the URL the user just captured, and it is best-effort.

### 10.3 Performance

The app must stay usable at 1,000 / 10,000 / 50,000 notes (PRD §19). Lists and search are
paged and indexed; the whole vault is never loaded into memory without reason.

### 10.4 Out of scope

AI, semantic search, OCR, transcription, cloud sync, accounts, collaboration, real-time
sync, plugins, and social features are explicitly out of scope (PRD §23) and must not be
partially built while the MVP is unstable.
