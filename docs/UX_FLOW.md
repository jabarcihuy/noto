# UX_FLOW — Noto

> Derived from `docs/PRD.md`. Describes how the user moves through the app. It does not
> add features and does not fully specify every screen. Visual rules live in
> `DESIGN_SYSTEM.md`; behavior lives in `FEATURES.md`.

## 1. Navigation Model

Top-level destinations (PRD §16):

```text
┌─────────────────────────────────────────────┐
│  Home        Search      Notebooks   Settings │
└─────────────────────────────────────────────┘
              ↑
        Quick Capture is the primary action,
        always reachable from Home and as a
        persistent action (FAB / capture bar).
```

- **Home** = Quick Capture entry + Recent Notes (PRD §16). Not a statistics dashboard.
- **Search** = full-text search, filters, sorting, saved searches.
- **Notebooks** = notebook browsing and note lists.
- **Settings** = data ownership (import/export/backup/restore), templates, app info.
- **Note detail / editor** is a full screen pushed from a list or a link.
- **Capture flows** are modal or pushed screens focused on a single input type.

**Implementation Decision:** navigation uses Expo Router with a bottom tab layout
(ARCHITECTURE.md §2). Deep links target note IDs (e.g. `/note/<id>`) so links and share
flows can open notes directly.

```text
Home ──▶ Note detail ──▶ Note detail (via wikilink)
  │            │
  │            ├─▶ Backlinks list
  │            └─▶ Attachment viewer
  ├─▶ Quick Capture ──▶ Text / Image / Voice / URL
  ├─▶ Search ──▶ Results ──▶ Note detail
  ├─▶ Notebooks ──▶ Notebook ──▶ Note list ──▶ Note detail
  └─▶ Settings ──▶ Import / Export / Backup / Restore / Templates
```

## 2. Main Screens

### 2.1 Home

- Capture action at the top (or a prominent FAB).
- Recent notes below: recently created, edited, or opened (PRD §11.4).
- Tapping a note opens it.
- Empty state (no notes): a short explanation and a direct capture action.
- Loading state: skeleton list while recent notes load.
- Error state: "Could not load recent notes" with Retry; capture still works.

### 2.2 Capture

- A lightweight chooser for input type: text, image, voice, URL.
- Text capture: title (optional) + content, Save always enabled unless truly empty.
- Image capture: camera/gallery choice, preview, save.
- Voice capture: record, stop, play, save, delete.
- URL capture: paste/enter URL, save immediately, metadata fills in afterwards.
- The user may leave at any time; unsaved text is confirmed before discarding
  (see §5).

### 2.3 Note detail / editor

- Title (editable, may be empty).
- Markdown content.
- **Implemented (Phase 4):** a secondary organization section with the note's notebook
  (tap to change or clear) and its tags (chips), plus a link to manage tags. These stay
  secondary to the content.
- Metadata row: created/updated timestamps, capture type.
- Actions: edit, export note, delete.
- Not yet implemented: attachments and backlinks sections.

### 2.4 Search

- Search field focused on entry.
- Results list with title, snippet, and match highlighting.
- Filter chips (tag, notebook, date, capture type) and a sort control.
- Saved searches accessible from the same screen.

### 2.5 Notebooks

- List of notebooks with an inline field to create one.
- A notebook opens a screen showing its notes, with rename/delete actions and a
  per-note "remove from notebook" action.
- Delete warns that notes are kept.
- Note counts and manual reordering are not implemented yet.

### 2.6 Settings

- Import (Markdown file/folder, Obsidian).
- Export (single note is in note detail; full vault here).
- Backup / restore to a local folder.
- Templates list (built-ins).
- Storage/privacy info; no account.

**Implemented (Phase 8).** Settings links to the read-only Templates screen.

### 2.7 Templates

```text
Home → "Dari template" (or Settings → Template)
   → template list (built-ins)
   → select one
   → capture screen pre-filled with template content
   → edit → Save → note detail
```

- The list shows name + description; loading, error (with retry), and empty states are
  handled. Selecting never saves anything.
- The capture screen shows a "Template: <name>" indicator and the pre-filled content; the
  user can change everything. A missing template shows a non-blocking message and an empty
  form.
- There are no template management actions (no edit/delete/reorder) in the MVP.

## 3. User Journeys

### 3.1 Capture → Save → Organize later (primary loop)

```text
Home → Quick Capture → type → Save
   → note exists in Recent
   → (later) open note → add tag / move to notebook
```

Requirement: capture is a small number of steps and never blocks on organization
(PRD §6.1, §5.1).

### 3.2 Capture → Connect → Find

```text
Capture a note
   → write [[Other Note]]
   → open the target later (or create it if unresolved)
   → see backlinks on the target
   → find it later through Search or Recent
```

### 3.3 Own the data

```text
Settings → Export vault → choose destination → vault folder/zip produced
   → (new device) Settings → Import/Restore → choose vault → notes and links restored
```

### 3.4 Share into the app

```text
Other app → Share → Noto
   → capture flow opens with shared payload
   → review → Save
```

### 3.5 Organize a note (notebook and tags)

```text
Note detail → Notebook row → pick a notebook or "no notebook" → back
Note detail → Manage tags
   → add a tag (appends #tag to content) or remove a tag
   → back; detail shows the updated tags
```

- Organization never blocks capture or saving: a note exists without a notebook or tags.
- Deleting a notebook never deletes notes; the notes return to "no notebook".

## 4. Capture Flows

### 4.1 Text Capture

1. User triggers capture.
2. Types title/content; no notebook/tag required.
3. Saves.
4. Note saved confirmation; remains in editor or returns to previous screen.

Cancellation: if content was entered, ask "Discard this note?" before leaving.

### 4.2 Image / File Capture

1. Choose camera, gallery, or file picker.
2. Select/capture the item.
3. Preview; add a caption/title if desired.
4. Save → file copied into vault, attachment metadata written, note created if needed.

Permission failures show a helpful explanation and an alternative path.

**Implemented (Phase 6).** Attachments are added from an existing note's detail screen
(Lampiran section): Galeri, Kamera, and Rekam suara. Gallery/camera permission is checked
and requested explicitly; when the OS will not ask again the user is sent to Settings.
The picked image is previewed inline with its aspect ratio and can be deleted. This phase
does not add an image-capture Quick Capture flow, so text capture is unchanged.

### 4.3 Voice Capture

1. Start recording (permission requested on first use).
2. Stop.
3. Play to verify, or delete and re-record.
4. Save → temp file moved into vault, audio attachment added.

**Implemented (Phase 6).** The record screen shows `idle → recording → ready → saving →
error`. Recording is indicated by a labelled red state plus elapsed time (not color
alone). A saved recording appears in the note with one shared play/pause control and a
`m:ss / m:ss` progress readout; leaving the screen releases the player and discards an
unsaved temp file.

### 4.4 URL Capture

1. Paste/type URL.
2. Save immediately — the note exists before any network work.
3. Metadata loads asynchronously; if it fails, show the URL-saved message from PRD §18.

**Implemented (Phase 10).** Home → "Simpan tautan" opens capture in URL mode. Saving
creates the note first, then attempts metadata; a failure keeps the note and shows
"Tautan tersimpan, tetapi preview belum tersedia." A malformed URL is saved as a plain
text note with an explanation.

### 4.5 Share Input

1. Payload arrives from the platform share mechanism.
2. It is routed to the matching flow (text/URL/image/file).
3. User reviews and saves.
4. Multiple payloads are handled in a defined order (FEATURES.md §1.5).

**Implemented (Phase 10).** The app opens the capture screen in review mode showing the
shared items; the user confirms with Save. Text/URL/image/audio route to the existing
capture and attachment flows; video and generic files are rejected with a clear message.
Share receiving needs a development build; Expo Go/Web falls back to manual capture.

## 5. Note Editing Flow

- Open note → edit inline.
- **Implemented (Phase 3):** content autosaves on a short debounce (~800 ms) and flushes
  on leaving the screen; an explicit Save is also available.
- The save indicator shows one of: `saved`, `saving`, `unsaved`, `error`. "Saved" is only
  shown after persistence succeeds. Autosave always persists the latest value; a slower
  older write never overwrites newer content.
- On failure the editor keeps user input, shows `error`, and offers retry. Leaving with a
  failed save asks for confirmation instead of silently discarding content.
- On save: content persisted, search index updated (Phase 1 index maintenance). Tag and
  wikilink re-parsing arrive with those features (Phase 4/5).
- Renaming a note never changes its ID and never breaks incoming links (PRD §10.3).

## 6. Search Flow

```text
Search tab → type query
   → results update (title + content)
   → optionally add filters (tag / notebook / date / type)
   → optionally change sort
   → open note
   → optionally "Save this search" → appears as a saved search
```

- Empty query shows recent notes or a prompt, not the entire vault.
- No results: empty state with "clear filters" when filters are active.
- Saved search opens and recomputes against current data (PRD §11.5).

**Implemented (Phase 7).** The Search tab debounces input (~300 ms), runs FTS5 where
available (otherwise a limited-mode notice and `LIKE` fallback), and pages 25 results with
a "Muat lagi" action. Filters (tag, notebook, capture type, date presets) and sort are
inline and combine with the query. Results show a highlighted snippet and open the
existing note detail screen. Saved searches can be created from the current state and
reopened; management (rename/reorder/delete) is still an open product question. Empty
states distinguish no-notes / no-match / no-filter-match, and errors keep the query and
filters with a retry action.

## 7. Linking Flow

### 7.1 Create a link while writing

```text
Type [[  → suggestions appear (matching note titles)
   → choose an existing note → link inserted and resolved
   → or type a new title and finish → link stays unresolved
   → if the typed title matches several notes → link is ambiguous
     and the user picks a target before it resolves
```

### 7.2 Follow a link

- Tap a resolved link → open the target note.
- Tap an unresolved link → offer "Create note '<title>'".
- Creating it resolves every link that pointed to that title.
- Tap an ambiguous link → show the matching notes and ask the user to choose one. The app
  never opens a guessed note. Choosing a target sets the relationship; a resolved link is
  never re-pointed by title matching later (DATABASE.md §4.5).

### 7.3 Backlinks

- At the bottom of a note, a "Backlinks" section lists source notes (PRD §10.4).
- Empty backlinks state: quiet placeholder, not an error.

**Implemented (Phase 5).** The editor watches the caret; while an unterminated `[[query`
precedes it, a debounced (~200 ms) suggestion list appears beneath the content field.
Choosing a suggestion replaces only the `[[query` fragment with `[[Title]]`; typing or
deleting the brackets dismisses the list and normal editing continues. Note detail renders
wikilinks as tappable links: resolved opens the target, unresolved offers "create note",
and ambiguous opens a chooser (title, notebook, updated date) that sets the target only
after the user picks one. The chooser and suggestions never use raw IDs as the primary
label, and no candidate is auto-selected.

## 8. Import / Export Flow

### 8.1 Export a note

```text
Note detail → Export
   → (if the note references attachments, warn that only the Markdown is exported)
   → .md created in a private export directory
   → platform share sheet → user chooses the destination
```

- The file follows the shared note format (DATABASE.md §9.1) and never modifies the note.
- If sharing is unavailable, the file is still created and the user is told.
- On failure the user is told the export failed and the note is safe, and can retry.

### 8.2 Export the vault

```text
Settings → Export vault
   → choose folder or zip
   → (progress for large vaults)
   → success summary; failure leaves live data untouched
```

### 8.3 Import / Restore

```text
Settings → Import
   → choose file / folder / vault
   → preview what will be imported (counts, conflicts)
   → confirm
   → progress
   → summary: imported, skipped, conflicts
```

- Conflicts are never auto-overwritten; the user chooses
  (FEATURES.md §9.3, PRD §12.5).

**Implemented (Phase 9).** Settings → Data offers "Ekspor vault", "Impor file Markdown",
"Impor folder", and "Periksa lampiran". Export opens the folder picker; if no folder is
picked it falls back to app-private storage and says so. Import opens the file or folder
picker, then runs the stages Membaca → Memvalidasi → Menulis → Menyelesaikan and shows a
summary with imported counts, conflicts, warnings, and skipped files. There is no preview
or confirm step yet; import is non-destructive (conflicts get new IDs). Errors keep the
current data untouched and are shown in user terms. ZIP export is not offered.

## 9. Empty, Loading, and Error States

### 9.1 Empty states

| Screen | Empty state |
| --- | --- |
| Home / Recent | "No notes yet — capture your first note." with capture action |
| Search results | "No notes match" + clear-filters when applicable |
| Backlinks | "No notes link here yet." |
| Tags | "No tags yet — add one while editing a note." |
| Notebooks | "No notebooks yet — create one, or just keep capturing." |
| Attachments | "No attachments on this note." |
| Saved searches | "No saved searches yet." |
| Import preview | "Nothing to import in this selection." |

Empty states must not look like errors and must suggest the next useful action.

### 9.2 Loading states

- Lists show skeletons/placeholders, not blank screens.
- Search shows an in-progress state while querying.
- Import/export/backup show determinate progress when total size is known, indeterminate
  otherwise.
- Binary attachments show a placeholder until loaded; images do not block note text.

### 9.3 Error states

Errors are categorized by cause and always phrased in user terms (PRD §18):

- **Secondary metadata failure** — "The link was saved, but its preview could not be
  loaded." Main data safe.
- **Missing attachment** — "This attachment is no longer available." Note still opens.
- **Storage/permission failure** — explain what was not saved and what to do; never show
  raw SQLite/filesystem errors.
- **Import/export failure** — report what succeeded and what did not; never silently
  overwrite or lose data.
- **Unavailable platform capability** (e.g. no camera, no share target) — state the
  limitation and offer an alternative; this is not a crash.

Every error offers a next step (retry, choose another location, continue) where one
exists.

## 10. Cross-platform UX Notes

- Layouts use cross-platform primitives; Android is the first styling target but no flow
  depends on Android-only behavior (ARCHITECTURE.md §9).
- Back navigation, share, and file picking use capability interfaces; if a capability is
  missing, the flow degrades to manual input instead of disappearing.
- Web/Desktop are not implemented in MVP; the flows above are written so they can be
  reused rather than redesigned (PRD §20).

## 11. Accessibility Notes

Accessibility requirements are defined in `DESIGN_SYSTEM.md` §Accessibility. Flows must
be completable with screen readers, with sufficient touch targets, and without relying on
color alone (e.g. unresolved links are not distinguished only by color).
