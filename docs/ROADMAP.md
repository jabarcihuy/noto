# ROADMAP — Noto

> Derived from `docs/PRD.md`. Breaks development into small, verifiable phases. Each
> phase ends in a working application state and produces meaningful product progress, not
> just a technical layer. Phases map to the success flow in PRD §25:
>
> ```text
> Capture → Save → Organize → Connect → Search → Export → Import
> ```

## Rules

- One phase at a time. A phase starts only when its dependencies are working.
- A phase is done only when its **Exit criteria** are demonstrably true on a device,
  offline unless stated.
- No phase may add out-of-scope features (PRD §23). Deferred ideas go to a backlog, not
  into a phase.
- Architecture, database, and documentation are kept in sync as each phase lands
  (PRD §27, AGENTS.md).

---

## Phase 0 — Foundation

**Product state:** the app installs and runs, showing the four-tab shell and honest empty
states. No notes can be created yet.

**Deliverables**

- Expo + TypeScript project scaffolded with strict typing (ARCHITECTURE.md §2).
- Navigation shell: Home, Search, Notebooks, Settings (UX_FLOW.md §1).
- Theme tokens and base components from `DESIGN_SYSTEM.md`.
- SQLite feasibility harness (connection, foreign keys, transactions, indexes, FTS5);
  production schema and migration runner are deferred to Phase 1 per Phase 0 scope
  (`DATABASE.md` §4, §6).
- Repository/port interfaces and one wiring point (ARCHITECTURE.md §4).
- Strings module: all user-facing copy goes through one i18n-ready layer, default
  Indonesian (`DESIGN_SYSTEM.md` §6).
- Test setup for the domain layer; lint + typecheck commands.
- Dependency and platform-capability assessment (below) with recorded results.

**MVP dependency / platform capability assessment**

Phase 0 must verify each capability on the first target (Android) and record the finding,
the chosen module, and any fallback. No capability is assumed:

| Area | What to verify / decide |
| --- | --- |
| SQLite / FTS5 | `expo-sqlite` opens; migrations run; **FTS5 verified per `DATABASE.md` §6.1**; fallback decision recorded |
| Filesystem | `expo-file-system` can create/read/delete files under the vault root; no absolute paths stored |
| Image picker | Gallery selection works and returns a copyable file |
| Camera | Photo capture works; permission flow defined |
| Microphone / audio playback | Record to a temp file, play back, permission flow |
| Document picker | Single Markdown file selection works |
| Folder import/export | Directory/tree selection; see scoped-storage item below |
| Android share receiving | Method for receiving shared text/URL/image/file (first-party if possible, otherwise a documented third-party/config-plugin decision per AGENTS.md §9) |
| ZIP/archive creation | Ability to produce `vault.zip`; chosen module or a documented alternative (e.g. folder-only export) |
| Markdown parsing/rendering | Render Markdown with wikilinks, tags, and attachment references; parse frontmatter |
| UUID generation | `expo-crypto.randomUUID()` available and unique |
| Android scoped storage / directory access | **Explicitly investigate** Storage Access Framework limits for choosing a backup/restore folder and importing a Markdown folder; define a fallback (e.g. app-private vault + single archive file) |

**Exit criteria**

- App runs on Android with tabs reachable and no crashes.
- Migrations run from an empty database and are idempotent on relaunch.
- A domain unit test and the typecheck/lint commands pass in CI/local.
- The dependency/capability assessment is complete, with FTS5 availability and Android
  scoped-storage limits recorded and any fallbacks documented.
- No user-facing string is hardcoded outside the strings module.

### Phase 0 findings (recorded)

**Verified**

- Expo SDK 57 project builds and bundles for Android (`expo export --platform android`
  produced a Hermes bundle).
- TypeScript (`tsc --noEmit`), ESLint, and Prettier pass.
- The pure Markdown pipeline (frontmatter + body, wikilinks, tag grammar, attachment
  references) passes unit tests and runs in the app (`src/phase0/markdown`).
- SQLite FTS5 **semantics** were validated against a real SQLite 3.53.4 build
  (`node:sqlite`): `CREATE VIRTUAL TABLE ... USING fts5(..., tokenize='unicode61')`,
  matching, diacritic folding (`cafe` matches `café`), CJK matching, update, and delete.
  The same checks are implemented for the device in `app/phase0.tsx`.

**Not verified (requires a device/emulator; no emulator image could be provisioned here)**

- `expo-sqlite` native runtime on Android (FTS5 availability in that build, FK,
  transactions, indexes).
- Filesystem write/read/delete, binary attachments, and the file/directory pickers.
- Camera, microphone, audio recording/playback, and the image picker.
- Android share receiving (requires a development build with the `expo-sharing`
  config plugin, not Expo Go).
- SAF directory selection and writing into a picked directory for import/export.

**Constraints discovered**

- There is **no first-party ZIP/archive API**. `vault.zip` requires a dependency decision
  (e.g. a pure-JS archiver) or a folder-only export fallback.
- Android share receiving **is** supported first-party: `expo-sharing` ships
  `getSharedPayloads()`/`getResolvedSharedPayloadsAsync()` plus a config plugin that adds
  `ACTION_SEND`/`ACTION_SEND_MULTIPLE` intent filters. It needs a config plugin entry and
  a development build; no third-party package is required.
- `expo-sqlite` on **web** requires additional Metro WASM handling and COOP/COEP headers;
  web is not an MVP target, so this is recorded but not configured.

**Approved Phase 0 dependencies**

First-party Expo capabilities (SDK 57):

| Dependency | Purpose | Required for MVP | Platform | Reason |
| --- | --- | --- | --- | --- |
| `expo` / `expo-router` | Runtime, file-based navigation | yes | Android (later iOS/web) | PRD §16, ARCHITECTURE §2 |
| `expo-sqlite` | Local structured data | yes | Android | PRD §21, DATABASE §1 |
| `expo-file-system` | Attachments + vault files; file/directory pickers | yes | Android | PRD §13, ARCHITECTURE §6 |
| `expo-crypto` | Stable UUID v4 IDs | yes | Android | DATABASE §2 |
| `expo-image-picker` | Gallery + camera image capture | yes | Android | PRD §9.2 |
| `expo-camera` | Camera capture | yes | Android | PRD §9.2 |
| `expo-audio` | Voice record/play | yes | Android | PRD §9.3 |
| `expo-document-picker` | Import single Markdown/other files | yes | Android | PRD §12.3 |
| `expo-sharing` (+ config plugin) | Share out and **receive** shared content | yes | Android | PRD §9.5, §12 |
| `@expo/vector-icons` | Tab icons | yes | Android | DESIGN_SYSTEM §2.7 |
| `expo-constants`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui` | Router/runtime shell | yes | Android | Expo Router requirements |
| `react`, `react-native`, `react-native-safe-area-context`, `react-native-screens`, `react-native-web` | App runtime and navigation | yes | Android (web later) | Expo baseline |

Third-party dependencies: **none added in Phase 0.**

Native / config-plugin requirements: `expo-sharing` config plugin (`android.enabled`)
for share receiving; `expo-audio` and `expo-sqlite` config plugins are registered by
`expo install`.

**Pending dependency decision:** archive/ZIP creation (JSZip or equivalent, or folder-only
export). Not added until the export phase decides.

---

## Phase 1 — Local Data Foundation

**Product state:** no user-facing feature. The database, migrations, repositories, and
relationship rules that later phases depend on are implemented and tested.

**Deliverables**

- Single idempotent database initialization boundary with a driver-agnostic SQLite port
  (`DATABASE.md` §8, `ARCHITECTURE.md` §7).
- Versioned migration runner using `PRAGMA user_version`; additive initial schema
  (`DATABASE.md` §4).
- Repository layer for notes, notebooks, tags, note-tags, note-links, attachment metadata,
  templates, saved searches, app metadata, and pending file deletions.
- Foreign keys enabled and verified; multi-table writes transactional.
- Wikilink resolution layer with `resolved` / `unresolved` / `ambiguous` states and the
  non-repointing invariant.
- Automated tests running the real schema against a real SQLite through the port.

**Exit criteria**

- `npm run typecheck`, `npm run lint`, and `npm test` pass.
- Fresh migrate, idempotent re-run, newer-version refusal, and failure rollback are
  covered.
- FK cascade / set-null / invalid-insert, transaction commit / rollback, note/tag/
  attachment relations, and all link invariants are covered.
- No user-facing product feature is implemented.

**Phase 1 findings (recorded)**

- `notes.title_key` was added (normalized title key) so wikilink resolution matches in
  SQL without loading notes into memory. Recorded in `DATABASE.md` §4.2 and §4.5.
- Indexes for recent/list/resolution queries are now justified and created in the initial
  schema (`DATABASE.md` §5).
- FTS5 is created in the initial migration when the runtime supports it; availability is
  detected at startup and selects the documented `LIKE` fallback. **FTS5 on the Android
  runtime remains unverified** (see Phase 0 findings).
- Tests run on Node's built-in SQLite (`node:sqlite`) through the same port; the
  `expo-sqlite` adapter is implemented but **not executed on a device** in this
  environment.
- Dev-only test tooling: `tsx` (runs TypeScript tests with `@/` path aliases). No new
  runtime dependency.

---

## Phase 2 — Fast Text Capture and Recent

**Product state:** the core Promise works: capture text, save locally, find it in Recent,
open it, read it, delete it — all offline.

**Deliverables**

- Quick Capture entry point and text capture flow (PRD §9.1; FEATURES.md §1.1).
- Note creation use-case with domain validation and stable IDs.
- Basic note editor (title + content + save) and update use-case that preserves the note
  ID and `created_at`.
- Note detail read view (title, content, timestamps) with edit and delete actions.
- Home = capture + recent notes (PRD §16, §11.4).
- Delete with confirmation and correct cleanup (DATABASE.md §10.3).
- Empty/loading/error states for Home, detail, editor, and capture (UX_FLOW.md §9).

**Exit criteria**

- A note survives app restart and device offline use (PRD §14).
- Recent list updates correctly for create/edit/open.
- Deleting a note leaves no orphan rows and does not crash on missing files.

### Phase 2 findings (recorded)

- Basic editing, the update use-case, and `opened_at` tracking (formerly listed under
  Phase 3) were implemented here because they are required for the
  create → edit → reopen loop. Phase 3 keeps autosave/save-status polish and the
  single-note Markdown export.
- `opened_at` writes are throttled (at most once per 60 s per note) so reopening a note
  does not write every time; editing never touches `opened_at`
  (implementation decision, DATABASE.md §4.2).
- `expo prebuild` changed `npm run android`/`npm run ios` to `expo run:android` /
  `expo run:ios`. The app depends on config plugins (share receiving), so a development
  build is required; Expo Go is not sufficient.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (55 tests), `expo export --platform android` (Hermes bundle), and
  `expo prebuild --platform android` (share intent filters generated).
- **Not verified on Android:** no device, emulator, or installable system image was
  available in this environment, so database init, migrations, FTS5, FK/transaction
  enforcement, and the note flow were **not executed on Android**. Repository/use-case
  behavior is verified against Node SQLite through the same port.

---

## Phase 3 — Note Editing and Metadata

**Product state:** notes are fully editable with autosave and clear save status.

**Deliverables**

- Markdown content editor with autosave, explicit save, and a save indicator
  (UX_FLOW.md §5).
- Editable title; empty titles shown as "Untitled".
- `opened_at` tracking for Recently Opened (DATABASE.md §4.2).
- Note export to a single `.md` file as the first ownership primitive
  (PRD §12.1; FEATURES.md §9.1).

**Exit criteria**

- Edits are not lost on navigation, backgrounding, or a failed write.
- A note survives rapid edit/close/reopen with content intact.
- Single-note Markdown export preserves title, content, and the documented metadata, and
  never modifies the source note.

### Phase 3 findings (recorded)

- Autosave is implemented with an ~800 ms debounce, an explicit Save, a flush on leaving
  the screen, and four save states (`saved` / `saving` / `unsaved` / `error`). A
  framework-free controller guarantees the latest value wins and stale writes cannot
  overwrite newer content (regression-tested).
- Single-note export uses the canonical `note-markdown` serializer that full-vault export
  will reuse, so there is no second format. Filenames are sanitized from the title with an
  `Untitled-<short-id>.md` fallback; `tags: []`/`notebook: null` are placeholders until
  those features exist.
- Attachment references are detected and the user is warned they are not bundled by a
  single-note export (DATABASE.md §7.2).
- New infrastructure: `src/core/fs` (`FileSystemPort` + expo adapter) and
  `src/core/platform` (`SharePort` + expo adapter). **No new dependency** — both use
  already-present `expo-file-system`/`expo-sharing`.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (70 tests), `expo export --platform android` (Hermes bundle). **Android runtime remains
  unverified** (no device/emulator image available); export's native file/share calls have
  not run on a device.

---

## Phase 4 — Notebooks and Tags

**Product state:** capture can be organized after the fact.

**Deliverables**

- Notebook CRUD, note lists per notebook, assign/remove note
  (PRD §10.6; FEATURES.md §5).
- Inline tag parsing per the MVP grammar (allowed characters, whitespace, inline code,
  fenced code, URL fragments) and reconciliation, plus tag chips
  (PRD §10.5; DATABASE.md §4.3–4.4; FEATURES.md §4).
- Tag name canonicalization (`#Java` = `#java`); no automatic tag deletion.
- Global tag management (rename/delete) is gated on the Open Product Questions below.
- Notebooks tab and per-notebook note list.
- Single-note export writes the note's real tags and notebook.

**Exit criteria**

- Deleting a notebook keeps its notes and makes them unassigned (PRD §10.6).
- `#Java` and `#java` resolve to one logical tag.
- Notes can be browsed per notebook from the UI.

### Phase 4 findings (recorded)

- Tags are content-derived: `parseTags` implements the documented grammar, and note
  create/update reconcile `note_tags` inside the same transaction. UI "add/remove tag"
  edits content (append/remove the `#tag` token) rather than a hidden tag store.
- `tags` rows are never deleted automatically; removing a token only removes the
  assignment. Global tag rename/merge/delete remains an open product question and was not
  implemented.
- Notebooks store their ID on the note (`notes.notebook_id`); deleting a notebook sets it
  to `NULL` and never deletes notes. No Trash was introduced.
- Single-note export passes the note's actual tags and notebook name through the existing
  serializer; the format is unchanged and stays import-compatible.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (90 tests), `expo export --platform android` (Hermes bundle). **Android runtime remains
  unverified** (no device/emulator image available).

---

## Phase 5 — Linking, Backlinks, Unresolved Links

**Product state:** notes are connected; the relationship layer from PRD §10 is real.

**Deliverables**

- Wikilink syntax parsing, including `[[target]]`, `[[target|alias]]`, `[[target#anchor]]`
  (DATABASE.md §4.5).
- Link storage with states `resolved` / `unresolved` / `ambiguous`; no automatic choice
  among duplicate titles (DATABASE.md §4.5).
- Resolution runs only for unconnected links; resolved links are never re-pointed.
- Rename-safe relationships; unresolved and ambiguous links allowed and surfaced.
- Backlinks section on note detail, computed from relationships (PRD §10.4).
- "Create note from unresolved link" and "choose target" flows (PRD §10.2).

**Exit criteria**

- Renaming a target keeps all incoming links working (PRD §10.3).
- An unresolved link becomes resolved when exactly one matching target is created.
- A duplicate-title link is ambiguous and requires a user choice; no note is guessed.
- Renaming a target then creating a new note with the old title leaves the original
  relationship intact (invariant test, DATABASE.md §10.14).
- Backlinks list is correct and contains no duplicated stored data.
- Deleting a target turns incoming links unresolved/ambiguous, without breaking source
  notes.

### Phase 5 findings (recorded)

- One domain parser (`src/features/links/domain/wikilink-parser.ts`) serves the editor,
  the reader, and link reconciliation; UI components do not re-parse. It supports
  `[[target]]`, `[[target|alias]]`, and `[[target#anchor]]`, ignores malformed input, and
  never rewrites content.
- `note_links` reconciliation runs inside the same transaction as note create/update via a
  `NoteLinkPort` (mirrors the Phase 4 tag port). After create/rename,
  `resolveByTargetText` resolves only rows whose `target_note_id IS NULL`; a resolved link
  is never re-pointed.
- States are the explicit Phase 1 column: `resolved` (`target_note_id` set),
  `unresolved` (no match), `ambiguous` (several matches). There is no separate state
  derived outside the database.
- Note detail renders wikilinks distinctly and navigates: resolved opens the target,
  unresolved offers "create note", ambiguous opens a chooser listing candidates by title,
  notebook, and updated date. Choosing a target calls `resolveLink`, which changes only
  `note_links`.
- Editor suggestions appear for an unterminated `[[query`, are debounced (~200 ms), query
  the indexed `notes.title_key` by prefix, and insert only the `[[Title]]` token.
- Backlinks are computed from `note_links` (no duplicate table); each source note appears
  once. Deleting a source removes its backlink via `ON DELETE CASCADE`.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (113 tests). **Android runtime remains unverified** (no device/emulator image available).
  `expo export` is bundling only and does not count as Android verification.

---

## Phase 6 — Attachments: Image and Voice

**Product state:** capture supports images and voice notes, stored locally as files with
metadata in the database (PRD §9.2–9.3).

**Deliverables**

- Filesystem boundary + vault layout, human-readable collision-safe attachment filenames
  (ARCHITECTURE.md §6, DATABASE.md §7.1).
- Attachment reference format in note content and its resolution (DATABASE.md §7.2).
- Image capture from camera and gallery; attachment display.
- Voice record / play / save / delete; temp-file handling.
- Generic file attachment via file picker. **Deferred / not implemented:** the Phase 6
  scope instruction explicitly excluded document/file attachments beyond image and audio
  (recorded in the Phase 6 findings below). This bullet is not an open product question;
  it is a scoped follow-up.
- Missing-attachment handling and the deletion/reconciliation sweep
  (PRD §18, DATABASE.md §7.3).

**Exit criteria**

- Attachments survive restart, are included in the vault folder, and never store absolute
  paths.
- Adding an image/voice creates a note when none exists.
- A missing file degrades to "This attachment is no longer available." without breaking
  the note.
- Deleting a note/attachment leaves no dangling metadata; interrupted cleanup is
  recovered by the reconciliation sweep; orphan files are reported, not silently deleted.

### Phase 6 findings (recorded)

- Image add from gallery (`expo-image-picker`) and camera; the binary is copied through
  `VaultFileSystemPort` into `Paths.document/vault/attachments/` and metadata is written
  in `attachments`. The note content receives an `![alt](attachments/<file>)` reference.
- Voice records to a temporary file, previews, and copies into the vault only on save
  (`[label](attachments/<file>)`). Discard removes the temp file. Playback uses one
  controlled player per screen and is released on unmount.
- Failure safety follows DATABASE.md §7.3: copy failure writes nothing; a metadata failure
  cleans the file up or queues it; delete queues the file before removing metadata and
  retries; reconciliation runs at startup and from Settings.
- Missing files render "Lampiran ini sudah tidak tersedia." and never break the note;
  orphan files are reported, not deleted.
- **No new dependency** was added: `expo-image-picker`, `expo-audio`, and
  `expo-file-system` were already installed in Phase 0. `expo-image-picker` was added to
  the app config plugins to declare camera/gallery permission text.
- **Scope discrepancy:** the deliverable "Generic file attachment via file picker" was
  *not* implemented because this phase's instructions explicitly excluded document/file
  attachments beyond image/audio. It remains for a later phase or a scoped follow-up.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (132 tests), `expo export --platform android` (bundling only). **Android runtime remains
  unverified** (no usable device/emulator image), so permissions, gallery, camera,
  microphone, storage, and playback have not run on a device.

---

## Phase 7 — Search, Filters, Sorting, Saved Searches

**Product state:** the retrieval promise from PRD §11 is complete.

**Deliverables**

- Search over title/content with paged results, using FTS5 where verified, with the
  documented fallback behavior and known differences (DATABASE.md §6.1–6.2).
- Filters: tag, notebook, date, capture type; combinable (PRD §11.2).
- Sorting: Recently Updated, Recently Opened, Newest, Oldest (PRD §11.3).
- Saved Search create and open, recomputed on open (PRD §11.5). Rename/reorder/delete
  management is an open product question (see Open Product Questions below).
- Search empty/loading/no-result states (UX_FLOW.md §9).

**Exit criteria**

- Search works offline and never loads the whole vault into memory (PRD §11.1, §19).
- Filters combine and clear correctly; saved searches reflect current data.
- Search remains responsive at the 10,000-note benchmark under the verified search engine.

### Phase 7 findings (recorded)

- Full-text search reuses the Phase 1 `notes`/`notes_fts` foundation; FTS5 is used when the
  runtime provides it and the documented `LIKE` fallback otherwise. The engine is reported
  per query (`fts5` / `like`) and the UI shows a limited-mode notice when degraded.
- Users type literal tokens; every token is quoted and prefix-matched, combined with AND.
  No boolean/phrase syntax is interpreted, and special characters cannot reach FTS as
  syntax.
- Filters: tag (normalized `tags.name`, AND across selected tags), notebook (by ID, rename
  safe), capture type (only values present in the data), and a date preset range. All
  filters AND with the query.
- **Provisional:** the date filter compares `updated_at` with inclusive boundaries. The
  created-vs-updated / inclusivity question is still open (Open Product Questions #3); the
  choice is isolated in `src/features/search/domain/date-range.ts` and reported, not
  finalized.
- Sorting: updated desc, opened desc (nulls last), newest, oldest, each with an `id ASC`
  tie-breaker for stable paging. Paging fetches `limit + 1` rows to compute `hasMore`
  without an unbounded count.
- Saved searches store name/query/filters/sort only and are recomputed on open. Create and
  open are implemented; rename/reorder/delete/export remain an open product question and
  were not added.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (158 tests), `expo export --platform android` (bundling only). **Android runtime remains
  unverified** (no usable device/emulator image), so FTS5 availability on Android is still
  unconfirmed; Node `node:sqlite` exercises the FTS5 path, and the `LIKE` fallback is
  covered by forcing `fts5Available: false`.

---

## Phase 8 — Templates

**Product state:** notes can start from the built-in structures in PRD §10.7.

**Deliverables**

- Idempotent seeding of the five built-in templates (DATABASE.md §4.7).
- Template picker in the create flow; prefill title/content.
- Templates settings screen listing built-ins.

**Exit criteria**

- Creating from each template produces an independent note (no ongoing template link).
- Seeding never duplicates templates across restarts/migrations.

### Phase 8 findings (recorded)

- Built-ins are seeded by the existing database boundary; the app adds read-only
  `TemplateUseCases` (list/read) and a Templates screen reached from Home and Settings.
- Selecting a template opens the existing capture screen with content pre-filled; the note
  is created only when the user taps Save, through the normal note create transaction. No
  autosave, note ID, or `template_id` is involved before that.
- Independence is copy-on-create: `templates.content` is copied into `notes.content`;
  editing either side never touches the other (tests cover both directions and a database
  reopen).
- Tags and wikilinks inside template content are processed by the existing note
  reconciliation; no template-specific organization, link, export, or metadata behavior
  was added. The Markdown serializer is unchanged.
- **CRUD:** list and read only. Custom template management is out of MVP scope per
  FEATURES.md §6, so no editor/delete UI was added.
- **Open issue (reported, not decided):** a deleted built-in template is re-inserted by
  the next startup seed, while a modified built-in is preserved. This is the pre-existing
  Phase 1 behavior; whether deletion should be permanent is unresolved.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (167 tests), `expo export --platform android` (bundling only). **Android runtime remains
  unverified** (no usable device/emulator image).

---

## Phase 9 — Import, Export, Backup, Restore

**Product state:** data ownership from PRD §12 is real and the success flow closes.

**Deliverables**

- Full vault export (`vault/` + `manifest.json` + attachments, or `vault.zip`) using the
  shared note format and human-readable, deduplicated filenames (DATABASE.md §9.1).
- Markdown import: single file and folder (PRD §12.3).
- Basic Obsidian import: wikilinks, tags, attachments (basename mapping, ambiguous
  references reported), preserving unsupported syntax
  (PRD §12.4, DATABASE.md §7.4).
- Local backup to a folder and restore from it, with conflict reporting and no silent
  overwrite (PRD §12.5).
- Import/export progress and summaries (UX_FLOW.md §8).

**Exit criteria**

- Export → wipe → import restores notes, notebooks, tags, links, and attachments via IDs.
- Obsidian import preserves content it does not understand as Markdown.
- Conflicts are reported and never silently overwrite existing notes.
- Export never mutates live data.

### Phase 9 findings (recorded)

- Full vault export writes `notes/`, `attachments/`, and `manifest.json` using the single
  note serializer; the manifest maps note/attachment IDs to files and carries links and
  states. Export validates duplicates and verifies every written file; it is read-only.
- Import supports one Markdown file and a folder (vault or Obsidian-style). It parses the
  documented frontmatter, derives titles from heading/filename when absent, merges
  frontmatter tags into content, resolves attachment references by unique basename, and
  preserves unresolved references verbatim with a report. Links resolve through the Phase 5
  rules; ambiguous links are never guessed.
- **Restore is import into the current vault.** No destructive replace mode exists; the
  current data is never wiped before validation.
- **Conflict policy (provisional):** colliding note IDs and attachment IDs/paths receive new
  local identities and are reported; nothing is overwritten. The DATABASE §9.3 "restore
  updates matching IDs" behavior is deferred until replace semantics are decided.
- **ZIP:** not implemented. There is still no first-party archive API and no dependency was
  added; folder export is the documented fallback, with an app-private destination when no
  folder is picked. This blocker is unchanged from Phase 0.
- **Android SAF:** `File.pickFileAsync` / `Directory.pickDirectoryAsync` are wired through
  the transfer port, but folder reading/writing on a device is **unverified**.
- Round-trip tests cover empty titles, duplicate titles, tags, notebooks, resolved/
  unresolved/ambiguous links, aliases, anchors, image and audio attachments, a missing
  attachment reference, special characters, idempotent re-import, and single-note export
  compatibility.
- **Follow-up (recorded):** templates and saved searches now round-trip (IDs, names,
  descriptions, content, query, filters, sort). Identical seeded built-ins are skipped;
  collisions with user data are reported and never overwritten. Unreferenced attachment
  files in an imported folder are reported and left in the source rather than silently
  discarded. ZIP remains unimplemented (folder fallback).
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (186 tests), `expo export --platform android` (bundling only). **Android runtime remains
  unverified** (no usable device/emulator image).

---

## Phase 10 — Share Input, URL Capture, and MVP Hardening

**Product state:** the full MVP scope of PRD §22 is present and stable.

**Deliverables**

- Platform share target routing text/URL/image/file into capture (PRD §9.5).
- URL capture with best-effort metadata and the exact PRD §18 failure message.
- Cross-platform boundary audit: no Android-only assumptions in core
  (ARCHITECTURE.md §9).
- Performance pass against 1,000 / 10,000 / 50,000 notes (PRD §19).
- Accessibility pass per `DESIGN_SYSTEM.md` §5.
- Documentation sync: every doc reflects the shipped behavior.

**Exit criteria**

- Capture → Save → Organize → Connect → Search → Export → Import completes with no account
  and no internet (PRD §25).
- URL metadata failure leaves the URL saved with the correct message.
- App remains usable at the 10,000-note benchmark; the 50,000-note result is measured and
  documented.
- Screen-reader and font-scaling checks pass on primary flows.

### Phase 10 findings (recorded)

- URL capture: Home → "Simpan tautan" opens URL mode. The note is created first
  (`capture_type = 'url'`, URL in `source_url` and content), then metadata is fetched with
  an 8 s timeout and 512 KB cap. Metadata never overwrites a user-entered title; the
  description is appended once; a preview image is stored through the normal attachment
  pipeline. Failure/offline keeps the note and reports "Tautan tersimpan, tetapi preview
  belum tersedia."
- Share input: a root listener uses `expo-sharing`'s first-party receiving APIs, resolves
  and clears the platform queue, deduplicates repeated deliveries, and opens capture for
  review. Text/URL/image/audio route through existing flows; video and generic files are
  rejected safely. Requires a development/standalone build.
- Hardening fixes found during the pass: URL preview images were initially written outside
  the attachment pipeline (breaking export/reconciliation) — fixed by adding
  `attachments.addImageFromUrl`; the URL enrichment suppressed the metadata description on
  a fresh note — fixed and covered by a test; startup attachment reconciliation was
  awaited (blocking large-vault startup) — now runs in the background.
- Added read-only `DiagnosticsUseCases` (`PRAGMA integrity_check`,
  `PRAGMA foreign_key_check`, schema version, FTS5 flag, counts) surfaced in Settings;
  diagnostics are never repairs.
- Phase 0 diagnostics (`src/phase0/`, the Settings screen) were **kept**: Android runtime
  verification is still outstanding and these checks are the tool for closing it. No
  production code depends on them.
- **Dependency review:** no dependency added in Phase 10. `expo-camera` and
  `expo-document-picker` are used only by Phase 0 diagnostics; `react-dom`,
  `react-native-web`, `expo-linking`, `expo-constants`, and `expo-system-ui` are Expo
  Router/Expo runtime peers used by the framework rather than direct imports. None were
  removed.
- Verified locally: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (202 tests), `expo export --platform android` (bundling only). **Android runtime remains
  unverified** (no device/emulator image), so URL metadata, share receiving, SAF, media,
  and FTS5 on-device behavior are all still unconfirmed.

### MVP validation pass (recorded)

- **Bug fixed:** vault import applied manifest-resolved links inside the per-note loop, so
  a link whose target appeared later in the same batch failed with a foreign-key error.
  Import is now two-pass (create all notes, then rebuild/resolve links), matching the
  documented import order; regression test covers import → export → import.
- **Bug fixed:** a shared image/audio whose attachment could not be stored left an empty
  note behind. The note is now rolled back and the payload reported as unreadable.
- Cross-feature regression suite added: template → tags/links, attachment → export,
  rename → search, rename target → resolved link + search, tag removal → tag filter,
  notebook rename → ID filter, import → search/backlinks, import → export → import, and
  full cold-restart persistence.
- Failure suite added: metadata unavailability, malformed frontmatter, missing attachment
  file, failed file deletion with queued cleanup, duplicate export paths, ambiguous and
  unresolved links.
- Performance smoke test (measured, Node `node:sqlite`, 1,000 notes): seed 1248 ms,
  search 2 ms, tag filter 1 ms, deep page (offset 900) 5 ms, vault export 103 ms. The
  10k/50k benchmarks remain **unmeasured**.
- Validation run: `tsc --noEmit`, `expo lint`, `prettier --check`, `npm test`
  (220 tests) all pass; `expo export --platform android` bundles. Android runtime is still
  unavailable (`adb` has no device; system-image directories are empty).

---

## Definition of MVP Done

The MVP is complete when the Phase 10 exit criteria hold and:

- every Must Have capability in PRD §22 works offline;
- no out-of-scope feature from PRD §23 has been partially built;
- `ARCHITECTURE.md`, `DATABASE.md`, `FEATURES.md`, `UX_FLOW.md`, `DESIGN_SYSTEM.md`, and
  this roadmap match the shipped product;
- the user can export and re-import their data without loss.

## Deferred (Not in MVP)

Backlog only, explicitly out of scope until the MVP is stable (PRD §23, §24): custom
user templates, trash/undo, cloud sync, conflict resolution, encryption, OCR,
transcription, semantic search, AI features, plugin system, collaboration, iOS/Web/
Desktop builds.

## Open Product Questions

These are unresolved product decisions. They are **not** requirements, and agents must
not invent answers. Resolve them through PRD §27 before they affect code or schema.

1. **Hard delete vs. trash** — should deleting a note be reversible (trash/undo)?
   Current MVP behavior: hard delete with confirmation (DATABASE.md §10.3,
   FEATURES.md §2.4).
2. **Empty note behavior** — may a note be saved with an empty title and empty content,
   or is Save disabled? Current provisional behavior: Save disabled when both are empty
   (FEATURES.md §1.1).
3. **Date filter semantics** — does the date filter use created or updated time, and are
   ranges inclusive? No default finalized (FEATURES.md §7.2).
4. **Tag management** — can tags be renamed, merged, or deleted globally, and what
   happens to the notes using them? Current: content-derived and never auto-deleted
   (DATABASE.md §4.3, FEATURES.md §4).
5. **Saved search management** — can saved searches be renamed, reordered, deleted, or
   exported? Create/open is defined; management is not (FEATURES.md §7.5).
6. **Duplicate-title UI behavior** — when several notes share a title, does the app
   prevent, warn, or allow duplicates, and where is the disambiguation UI shown?
   Resolution must remain explicit and never automatic
   (DATABASE.md §4.5, UX_FLOW.md §7.2).
7. **Tag grammar edge cases** — namespaces/nested tags (`#a/b`) are excluded from MVP;
   confirm that remains acceptable (FEATURES.md §4).
8. **UI language / localization** — Indonesian is the MVP default; is multi-language
   support a product goal, and when? (DESIGN_SYSTEM.md §6).
