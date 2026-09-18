# ARCHITECTURE — Noto

> Derived from `docs/PRD.md`. This document explains how the application is divided
> technically. It must not change product requirements. Technical choices not fixed by
> the PRD are marked **Implementation Decision**.

## 1. Architectural Goals

The architecture exists to satisfy these PRD requirements, and nothing more:

- **Offline-first** (PRD §14, §21): core works with no account, server, or internet.
- **Cross-platform readiness** (PRD §20): Android first, but core logic must survive a
  move to iOS, Web, and Desktop without a rewrite.
- **Rename-safe relationships** (PRD §10.1–10.4): links keyed by stable note IDs, not titles.
- **Data ownership** (PRD §12): import/export must be self-contained and reversible.
- **Scale** (PRD §19): list and search must not load the whole vault into memory.

To meet these, the code is split into four layers with a strict one-way dependency rule.
No additional abstraction (DI container, event bus, state machine framework, backend) is
introduced unless a concrete requirement demands it (PRD §6.6, §21).

## 2. Technology Baseline

| Concern | Choice | Source |
| --- | --- | --- |
| Runtime | React Native | PRD §21 |
| Tooling / native modules | Expo | PRD §21 |
| Language | TypeScript (strict) | PRD §21 |
| Structured data | SQLite | PRD §21 |
| Binary data | Local filesystem | PRD §21 |

**Implementation Decision:** use Expo Router for navigation (file-based, typed, first-party
with Expo). It replaces the need for a separate navigation library and keeps the app
cross-platform.

**Implementation Decision:** use `expo-sqlite` as the SQLite provider and
`expo-file-system` as the filesystem provider. Both are first-party Expo modules and do
not add a custom native layer.

No other runtime dependency may be added without a documented need (PRD §21, AGENTS.md).
The full MVP capability/dependency set (camera, audio, document picker, share receiving,
archive/zip, Markdown rendering/parsing, UUID) is assessed in `ROADMAP.md` Phase 0 before
being locked in; the approved dependency table is recorded there under **Phase 0
findings**.

## 3. Layers

```text
┌─────────────────────────────────────────────────────────────┐
│ UI Layer            app/, src/ui/, features/*/ui/           │
│ Screens, components, navigation. Renders state, dispatches. │
└───────────────────────────┬─────────────────────────────────┘
                            │ calls use-cases
┌───────────────────────────▼─────────────────────────────────┐
│ Application Layer   features/*/application/                 │
│ Use-cases, orchestration, transactions, permissions.        │
│ Defines ports (repository + platform interfaces).           │
└───────────────────────────┬─────────────────────────────────┘
                            │ uses
┌───────────────────────────▼─────────────────────────────────┐
│ Domain Layer        src/core/domain/, features/*/domain/    │
│ Pure rules: entities, wikilink parsing, tag normalization,  │
│ search/filter rules, import/export mapping. No I/O.         │
└─────────────────────────────────────────────────────────────┘
                            ▲ implements domain/application ports
┌───────────────────────────┴─────────────────────────────────┐
│ Data + Platform      src/core/db/, src/core/fs/,            │
│ (Infrastructure)     src/core/platform/, features/*/data/   │
│ SQLite repositories, filesystem, camera, mic, share, picker.│
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Domain Layer

- Pure TypeScript. May import **only** from the domain layer.
- Contains entities and value objects (`Note`, `Notebook`, `Tag`, `Link`, `Attachment`,
  `Template`, `SavedSearch`), ID generation rules, wikilink syntax parsing, tag
  normalization, and query/filter rule construction.
- Contains **no** React, React Native, Expo, SQLite, or filesystem imports.
- Must be directly unit-testable in Node.

### 3.2 Data + Platform Layer (Infrastructure)

- Implements the ports declared by the application layer.
- Repositories translate between SQLite rows and domain objects.
- Platform adapters wrap device capabilities behind small interfaces.
- This is the **only** layer allowed to import `expo-sqlite` and `expo-file-system`
  (see §6 and §7).

### 3.3 Application Layer

- One module per user-visible operation ("use-case"), e.g. `createNote`,
  `updateNoteContent`, `resolveLinks`, `exportVault`, `importMarkdown`.
- Owns transaction boundaries and ordering (for example: save note → re-index search →
  re-resolve links).
- Depends on domain types and on **interfaces** for persistence and platform services.
- Contains no UI code and no SQL strings outside repository calls.

### 3.4 UI Layer

- Screens and components only. Reads state, calls application use-cases, renders results.
- Never issues SQL, never touches the filesystem directly, never calls a platform module
  directly (it calls an application use-case).
- May hold ephemeral view state (input text, dialog open/closed). Durable state lives in
  the database through use-cases.
- All user-facing strings come from the strings layer (`src/ui/i18n`), never hardcoded in
  components. Default language is Indonesian (`DESIGN_SYSTEM.md` §6).

## 4. Dependency Direction

```text
ui ─────────▶ application ─────────▶ domain
                     ▲                    ▲
                     │ implements         │ depends on
              data / platform ────────────┘
```

Rules:

1. `domain` imports nothing outside `domain`.
2. `data` and `platform` import `domain` (and the port types they implement).
3. `application` imports `domain` and port interfaces, never concrete data/platform code.
4. `ui` imports `application` and read-only `domain` types; never `data`/`platform`.
5. Composition happens at a single wiring point (app startup / providers), which is the
   only place that may construct concrete adapters and inject them into use-cases.

**Why:** the domain rules (linking, tags, export format) are the parts most likely to
matter across platforms. Keeping them free of I/O makes them testable offline and portable.

## 5. Feature Structure

Code is organized **by feature**, not by technical type, so a feature's rules, storage,
and UI live together.

```text
app/                          # Expo Router routes (thin screens)
├── _layout.tsx
├── (tabs)/
│   ├── index.tsx             # Home
│   ├── search.tsx
│   ├── notebooks.tsx
│   └── settings.tsx
├── note/[id].tsx             # Note detail / editor
└── capture/                  # capture flows (text, image, voice, url)

src/
├── core/
│   ├── domain/               # shared entities + value objects
│   ├── db/                   # SQLite port, connection, migrations, transaction helper
│   ├── fs/                   # filesystem boundary (attachments + vault IO)
│   └── platform/             # capability interfaces + Expo implementations
├── features/
│   ├── notes/                # domain/ application/ data/
│   ├── capture/
│   ├── links/
│   ├── tags/
│   ├── notebooks/
│   ├── search/
│   ├── templates/
│   ├── attachments/
│   └── vault/                # import / export / backup-restore
├── repositories.ts           # builds repositories from one database handle
├── composition.ts            # single wiring point (Expo adapters + seeding)
└── ui/
    ├── theme/                # design tokens (see DESIGN_SYSTEM.md)
    ├── i18n/                 # user-facing strings; default Indonesian, i18n-ready
    └── components/           # shared presentational components

tests/                        # automated tests (real SQLite via the SQLite port)
```

Each feature follows the same shape:

```text
features/<name>/
├── domain/          # pure rules specific to the feature
├── application/     # use-cases
├── data/            # repository implementations (SQLite)
├── ui/              # feature-specific components/screens helpers
└── index.ts         # the feature's public surface
```

Features communicate through the application layer (use-cases), not by importing each
other's internals. A feature may expose read-only domain types from its `index.ts`.

## 6. File System Boundary

- **Only** `src/core/fs` and `src/core/platform` may import `expo-file-system`.
- All binary content (images, audio, other files) is stored as a local file. The database
  stores only **metadata and a vault-relative path** (PRD §13, `DATABASE.md`).
- The application defines one **vault root** directory. Attachment paths are stored
  relative to that root, never as absolute device paths.
- Filenames are human-readable: attachment files are sanitized from their original name
  with a deterministic collision suffix, and exported note files use sanitized titles.
  Deduplication is case-insensitive for cross-platform safety (`DATABASE.md` §7.1, §9.1).
- The stable ID remains the identity key and is stored in metadata/frontmatter; it is
  never inferred from a filename.
- Deleting a note and deleting its attachment files must happen together; a failed file
  delete must leave recoverable metadata, not a silent orphan (`DATABASE.md` integrity
  rules).
- Import/export (PRD §12) is implemented here as file reads/writes on the vault layout.
- **Phase 6:** the same module exposes `VaultFileSystemPort` (copy into vault, delete,
  existence/size, list directory, display URI). Attachments depend on this interface; the
  UI receives only a display URI, never a stored absolute path. The vault root is
  `Paths.document/vault`; stored paths remain `attachments/<file>`.
- **Phase 9:** `TransferFileSystemPort` adds file/directory picking (Android SAF),
  recursive listing, text reads, and writing/copying into a picked export directory. The
  vault export/import application code depends only on this port, so it is testable with
  an in-memory fake and never handles raw paths in React. Export is read-only; import
  copies files into the vault before database writes.

## 7. Database Boundary

- **Only** `src/core/db` and `features/*/data` may import `expo-sqlite`.
- The database is the source of truth for structured data. There is no server copy.
- All writes run inside a transaction (`src/core/db` provides the helper). A use-case that
  changes several tables (note + tags + links + search index) is atomic.
- Schema changes happen only through the versioned migration runner (`DATABASE.md`).
- Full-text search uses SQLite FTS5, whose availability is verified in the actual Expo
  runtime in Phase 0 (`DATABASE.md` §6.1) and not assumed.
- If FTS5 is unavailable, the repository falls back to `LIKE` queries with documented
  behavioral differences (substring vs. token matching, no ranking, limited Unicode case
  folding) and possible performance limits at scale (`DATABASE.md` §6.2). The UI does not
  branch, but the platform difference is known and recorded.
- Search results are always paged; the whole result set is never loaded into memory
  (PRD §19).

## 8. Platform Abstraction

The PRD (§20) states that platform-specific capabilities may differ. Each capability is
defined as a small interface; Expo modules provide the default implementation.

```text
src/core/platform/
├── capabilities.ts     # interfaces
├── expo/               # Expo-backed implementations
└── index.ts            # capability detection + selection
```

Capabilities and their interfaces:

| Capability | Interface responsibility | PRD reference |
| --- | --- | --- |
| FileSystem | vault root, read/write/delete files, select file or directory | §9.2, §12, §20 |
| Camera | capture a photo | §9.2 |
| Microphone | record / play audio | §9.3 |
| FilePicker | pick images, audio, markdown files, and a directory (SAF) | §9.5, §12.3 |
| ShareReceiver | receive shared text/URL/image/file | §9.5 |
| Network | fetch URL metadata (optional) | §9.4, §14 |
| Archive | create/read `vault.zip` | §12.2 |
| Notifications | reserved; not used in MVP | §20 |

**Implementation decision (Phase 0):** share receiving is implemented with the
first-party `expo-sharing` module — `getSharedPayloads()` plus its config plugin
(`android.enabled`, `singleShareMimeTypes`, `multipleShareMimeTypes`) which adds
`ACTION_SEND`/`ACTION_SEND_MULTIPLE` intent filters. It requires a development/standalone
build, not Expo Go. No third-party dependency is needed. Archive/ZIP has no first-party
provider; the choice is still open (`ROADMAP.md` → Phase 0 findings).

Rules:

- Domain and application layers depend on these interfaces, never on Expo directly.
- Each capability reports availability. If a capability is missing on a platform, the
  feature degrades gracefully and reports why; it must not crash and must not block the
  rest of the app.
- No platform-specific behavior may be assumed by core logic (see §9).

**Implementation decision (Phase 6):** the capability interfaces live as flat files in
`src/core/platform/` (matching the existing `SharePort`), not a `capabilities.ts`/`expo/`
tree. Gallery and camera are exposed as `ImageSourcePort` (constructed at the composition
root and reachable as `services.media`). Recording and playback are inherently
component-scoped, so they are exposed as the `useVoiceRecorder` and `useVoicePlayer`
hooks in the same module; screens never import `expo-audio` directly. `expo-image-picker`
and `expo-audio` were already installed in Phase 0, so **no new dependency** was added for
this phase.

**Implementation decision (Phase 9):** archive/ZIP remains unresolved — there is no
first-party ZIP API, and no archive dependency was added. Full vault export therefore uses
the documented folder fallback (a picked directory, or an app-private directory when
picking is unavailable); `vault.zip` is not produced. Import uses the SAF file/directory
pickers via `expo-file-system`; folder behavior on Android remains **unverified** until it
runs on a device (`ROADMAP.md` → Phase 9 findings).

**Implementation decision (Phase 10):** URL metadata is the only MVP network call. It is
behind `UrlMetadataPort` (`fetch` adapter with an 8 s timeout, 512 KB cap, and a
regex-based field extractor); no HTML is executed or injected, and no new dependency was
added. Share receiving is behind `ShareReceivePort`, implemented with `expo-sharing`'s
first-party `getSharedPayloads`/`getResolvedSharedPayloadsAsync`/`clearSharedPayloads`;
the root listener publishes payloads to an in-memory store and the capture screen asks the
user to review before saving. Both capabilities degrade gracefully when unavailable
(Expo Go/Web).

## 9. Cross-platform Strategy

- Android is the first target (PRD §15, §20) but **no Android-only assumption is allowed
  in domain, application, or data layers**.
- Platform differences live only behind the capability interfaces (§8).
- UI is built from cross-platform primitives. Where a leaf component genuinely needs a
  platform variant, use Expo's platform-specific file extensions for that leaf only; this
  must not leak upward.
- Filesystem access on Web/Desktop will differ (browser storage vs. OS directory). The
  vault-root concept is preserved so the domain model is unchanged; only the FileSystem
  implementation is replaced.
- Share input is Android-specific in MVP; on platforms without a share target, the same
  payloads can still enter through the relevant capture flow manually. The capture
  use-cases are therefore modeled independently of the share mechanism.

## 10. Local-first Data Flow

```text
User action
   ↓
UI calls use-case
   ↓
use-case validates with domain rules
   ↓
use-case writes to SQLite (transaction) + filesystem (if binary)
   ↓
use-case refreshes derived data (search index, resolved links)
   ↓
UI reads fresh state from repository
```

- The write is confirmed to the user only after the transaction commits (PRD §17).
- Network is never required for this path (PRD §14).
- URL metadata (PRD §9.4) is the only MVP network call. It runs after the URL is already
  saved, is best-effort, and failure never rolls back the saved note.

## 11. Navigation Overview

Top-level structure follows PRD §16: `Home`, `Search`, `Notebooks`, `Settings`, with
Quick Capture as the primary action. Screen-by-screen behavior is defined in `UX_FLOW.md`.

## 12. What This Architecture Deliberately Does Not Include

These are out of scope for the MVP (PRD §23) and must not be scaffolded:

- backend, accounts, authentication, cloud sync, real-time sync;
- AI, semantic search, OCR, transcription;
- plugin system, social features, collaboration;
- dependency injection framework, global event bus, or state-machine library.

Adding any of these requires the documented change process in PRD §27 and AGENTS.md.
