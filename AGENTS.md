# AGENTS — Noto

Rules for AI agents working on this repository. Read this file and the relevant
`docs/` files before making any change. This repository is **offline-first** and
**local-first**; that is a product requirement, not a preference.

## 1. Documentation Priority

Source-of-truth order, highest first:

1. `docs/PRD.md` — product source of truth. Do not change product behavior here.
2. This file (`AGENTS.md`) — process and safety rules.
3. `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/FEATURES.md`,
   `docs/UX_FLOW.md`, `docs/DESIGN_SYSTEM.md`, `docs/ROADMAP.md` — derived contracts.
4. Code and code comments.

If code and a derived document disagree, the document wins until it is corrected through
the process in §12. Do not silently "fix" code to match an undocumented assumption.

**Allowed convention:** technical choices not fixed by the PRD are written as
`**Implementation Decision:** ...`. Agents may make such decisions and must document them;
they may not change product behavior this way (PRD §27).

Product decisions not made by the PRD are tracked in `docs/ROADMAP.md` →
**Open Product Questions**. Agents must not invent answers to those questions; stop and
report when a task depends on one.

## 2. Inspect Before Coding

Before writing any code:

1. Read `docs/PRD.md` and the documents relevant to the task.
2. Inspect the repository structure and the files you will touch.
3. Check `package.json` for existing scripts and dependencies. Do not assume a library,
   test runner, or command exists.
4. Search for existing implementations before adding new ones.
5. If the repository has no project scaffold yet, that is expected: do not invent one as
   a side effect of an unrelated task; follow `ROADMAP.md` Phase 0.

Report what you found. Never modify files you were not asked to touch without saying so.

## 3. Scope Control

- The MVP scope is exactly `docs/PRD.md` §22 Must Have. Everything in §23 is out of
  scope.
- Do not add features, screens, settings, or abstractions that are not in the MVP,
  even if they "would be easy".
- Do not partially build future features (AI, sync, accounts, OCR, transcription,
  semantic search, plugins, collaboration).
- Keep changes minimal and local. Do not refactor unrelated code in the same change.
- If the task appears to require an out-of-scope change, stop and report the conflict
  instead of expanding scope.

## 4. Architecture Rules

Follow `docs/ARCHITECTURE.md`.

- **Layer direction is one-way:** `ui → application → domain`, with `data`/`platform`
  implementing ports. Never reverse it.
- **Domain is pure:** no React, React Native, Expo, SQLite, filesystem, or network
  imports in `domain/`.
- **UI does not touch infrastructure:** screens call application use-cases; they never run
  SQL or read files directly.
- **Application owns orchestration and transactions:** multi-step writes happen in a
  use-case, atomically.
- **One wiring point** constructs concrete adapters. Do not scatter `new`/imports of
  infrastructure across features.
- **Feature structure:** `features/<name>/{domain,application,data,ui,index.ts}`;
  cross-feature access only through public use-cases or read-only domain types.
- Do not introduce a backend, DI container, event bus, state-machine framework, or global
  singleton cache without a concrete, documented need. Simplicity is a requirement
  (PRD §6.6).

## 5. Database Rules

Follow `docs/DATABASE.md`.

- The database is the source of truth for structured data. Never bypass it with
  in-memory-only state for durable data.
- Schema changes only through versioned migrations. Migrations are **additive**; never
  drop or rewrite user data.
- Never open a database whose `user_version` is newer than the app understands.
- Use the repository layer; do not write ad-hoc SQL in UI or domain code.
- Keep the FTS index updated in the same transaction as note writes.
- Preserve stable IDs. Never generate a new ID for an existing note, and never key a
  relationship on a title.
- `notes.title_key` is derived (NFKC + trim + lowercase + whitespace collapse) and is
  maintained by the note repository. It is a lookup aid; relationships still key on IDs.
- Link states are explicit (`resolved` / `unresolved` / `ambiguous`). Resolve a link only
  on a unique title match; never pick one when several match. Re-resolve only links whose
  `target_note_id IS NULL`; never re-point a resolved link by title matching
  (DATABASE.md §4.5).
- Tags are content-derived and are never deleted automatically (DATABASE.md §4.3).
- Attachment file cleanup must use the pending-deletion queue and reconciliation sweep;
  never delete user files or metadata silently (DATABASE.md §7.3).
- Enforce foreign keys (`PRAGMA foreign_keys = ON`) and wrap multi-table writes in a
  transaction.
- Seed data (built-in templates) must be idempotent.
- Add indexes only when a real query needs them; document the reason.

## 6. Data Safety

This app is the user's only copy of their data during offline use. Treat it accordingly.

- Never delete or overwrite user data without explicit user action and confirmation.
- Import/restore must not silently overwrite existing notes; report conflicts
  (PRD §12.5, DATABASE.md §9.3).
- Delete operations clean up all related rows and files in one transaction and never
  leave dangling references (incoming links become unresolved, not broken).
- Attachment metadata is written only after the file is successfully created; clean up
  orphan files on failure.
- Attachment file/row cleanup is recoverable and must follow DATABASE.md §7.3: queue
  deletions, reconcile on startup, report missing/orphan files, and never silently delete
  unreferenced user files.
- A failed secondary operation (metadata fetch, preview, export thumbnail) must never
  roll back or corrupt the primary data.
- Never log or transmit note content, attachment contents, or file paths to external
  services. No analytics or crash reporting that includes note content.
- Do not add telemetry or network calls without an explicit, documented requirement.

## 7. Offline-first Rules

- Every core operation listed in `docs/PRD.md` §14 must work with no connectivity.
- The only MVP network use is best-effort URL metadata (PRD §9.4); it runs after the URL
  is saved and its failure is harmless.
- Do not add a required server, account, login, or remote feature flag.
- Do not make a core flow await the network. Network code must have timeouts and offline
  fallbacks.
- Test new features with network disabled.

## 8. Platform-Specific Boundaries

Follow `docs/ARCHITECTURE.md` §8–§9.

- Android is the first target, but core logic must not assume Android.
- Access device capabilities only through the interfaces in `src/core/platform`.
  Expo modules are implementations, not direct dependencies of domain/application/UI.
- If a capability is unavailable, degrade gracefully with a user-facing explanation; do
  not crash and do not hide the rest of the feature.
- Platform-specific file extensions are allowed only for leaf UI or platform adapters.
  They must not leak into shared logic.
- Never store absolute device paths in the database; store vault-relative paths.
- Assume filename case-sensitivity and illegal-character rules differ across platforms.

## 9. Dependency Rules

- No new runtime dependency without a concrete, documented need (PRD §21).
- Prefer Expo/React Native first-party modules over third-party equivalents.
- Never add a dependency because it is popular.
- Never add a backend or server dependency to make a client feature easier.
- When adding a dependency, document: what it does, why the platform/first-party option
  is insufficient, and its maintenance/security weight.
- Keep dependencies minimal in the domain layer: ideally none.

## 9.1 Build & Release Tooling (EAS)

The project owner has authorised the use of the **EAS CLI** for producing Android builds.
Scope and hard limits:

**Allowed**

- `eas whoami` — verify the existing session. Never ask the owner for credentials or tokens.
- `eas init` — link the project to the owner's Expo account when not yet linked.
- `eas build --platform android --profile <development|preview>` — produce installable APKs.
- `eas build:list` / `eas build:view` / `eas build:cancel` — inspect or cancel builds.
- `eas build:configure` — create/refresh `eas.json`.

**Never**

- `eas account:login` / `eas account:logout`, or any credential/token handling.
- `eas submit`, `eas update`, `eas channel:*`, `eas env:*`, or anything that publishes,
  submits, or alters Expo account/billing/credentials settings.
- Changing a profile to production, or running a release/store build.
- Adding a dependency or changing the stack to make a build pass.

**Conventions**

- `development` profile → dev-client APK, needs Metro (`npx expo start --dev-client`).
- `preview` profile → standalone release APK with the JS bundle; this is the artifact for
  manual QA and the one to hand to the owner.
- Keep `appVersionSource: local` and the existing keystore; never regenerate credentials.
- Local validation (`npm test`, `tsc --noEmit`, `expo lint`, `prettier --check`,
  `npx expo-doctor`) must pass before a build is started.
- EAS requires a git repository; commit before building so the build records a commit.
- Report the build ID, the artifact URL, and its SHA-256 so the owner can detect a
  corrupted download (a truncated APK fails with `INSTALL_PARSE_FAILED_NO_CERTIFICATES`).
- A finished EAS build is **build-verified only**. Never report it as Android runtime
  verification.

## 10. Testing Requirements

- Domain logic (wikilink parsing, tag grammar/normalization, link resolution,
  search-query building, import/export mapping) must have unit tests; it is pure and easy
  to test.
- Link resolution invariants (DATABASE.md §4.5, §10.14) require tests: unique match
  resolves, no match is unresolved, multiple matches are ambiguous, and a resolved link
  is never re-pointed after a target rename or the creation of a duplicate title.
- Data/repository changes need tests for the affected queries, including relationships
  (links, backlinks, tags, notebook moves) and integrity rules.
- Bug fixes start with a failing test that reproduces the bug, then the fix.
- If the repository has test scripts, run them. If not, state that no test harness exists
  rather than inventing one inside an unrelated task.
- Do not claim a feature works without running it. If you cannot run it, say so.
- Verify offline behavior for any feature touching the network boundary.

## 11. Debugging Workflow

1. Reproduce the issue and capture the exact input/state.
2. Determine which layer is at fault (UI state, application ordering, domain rule, data
   query, platform capability, filesystem).
3. Add a failing test at the lowest layer that reproduces it.
4. Fix the root cause, not the symptom.
5. Re-run tests and the affected user flow.
6. Check for related integrity issues (orphan rows, stale FTS, unresolved-link drift,
   missing files).
7. Never "fix" data corruption by deleting the user's rows or files. Prefer repair and
   report.

Useful diagnostics: `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and migration
version inspection (DATABASE.md §10.13). These are debugging tools, not user-facing flow.

## 12. Documentation Updates

- Any behavior change updates the derived document that owns it, in the same change:
  - feature behavior → `FEATURES.md`
  - schema/data rules → `DATABASE.md`
  - layering/platform → `ARCHITECTURE.md`
  - navigation/screens → `UX_FLOW.md`
  - visual/components → `DESIGN_SYSTEM.md`
  - phase status → `ROADMAP.md`
- A **product requirement** change follows PRD §27 exactly:

  ```text
  Identify problem → Explain impact → Propose change → Update PRD → Update affected docs
  ```

  Never change product behavior through code or a derived doc alone.
- If a technical decision was necessary, record it as `**Implementation Decision:**` and
  keep it consistent across documents.
- Keep the documents mutually consistent; contradictions are bugs.

## 13. Reporting Format

When finishing a task, report:

1. **What changed** — files created/updated, with paths.
2. **Why** — the requirement or document that justified it.
3. **Decisions** — any `Implementation Decision` made and alternatives rejected.
4. **Assumptions** — anything not determined by the PRD.
5. **Ambiguities/contradictions** found, with the documents involved.
6. **Verification** — commands run and their results; what was not tested and why.
7. **Code changes** — state clearly whether any code was changed. If the task was
   documentation-only, say so explicitly.

Keep the report factual. Do not claim success without evidence.

## 14. Current Repository State

- The documentation set exists: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`,
  `docs/FEATURES.md`, `docs/UX_FLOW.md`, `docs/DESIGN_SYSTEM.md`, `docs/ROADMAP.md`, and
  this file.
- Phase 0 scaffolded an Expo SDK 57 + TypeScript project (Expo Router). Phase 1 added the
  local data foundation: `src/core/db/` (SQLite port, migrations, database boundary),
  `src/features/*/` (domain + repositories), `src/repositories.ts`, and
  `src/composition.ts` (the single wiring point). See `ROADMAP.md` → Phase 0/1 findings.
- There are no post-MVP features yet (Phase 10 is the last planned MVP phase). Phase 2
  added the first usable flow: Quick Capture
  (text), note detail, basic editor, Home Recent, and notes application use-cases in
  `src/features/notes/application/`, wired through the app provider
  (`src/ui/providers/app-provider.tsx`). Phase 3 added debounced autosave with save-state
  feedback and single-note Markdown export (`src/features/vault/`), backed by the
  `src/core/fs` and `src/core/platform` ports. Phase 4 added notebooks and content-derived
  tags (`src/features/notebooks/`, `src/features/tags/`) and passes real tags/notebook
  into export. Phase 5 added wikilinks, backlinks, unresolved/ambiguous link handling, and
  ambiguity selection (`src/features/links/domain/wikilink-parser.ts`,
  `src/features/links/application/{reconcile-note-links,link-use-cases}.ts`), with link
  reconciliation wired into note create/update through `NoteLinkPort`. Phase 6 added image
  and voice attachments (`src/features/attachments/application/attachment-use-cases.ts`,
  `src/features/attachments/domain/`), vault filesystem methods (`src/core/fs`), and
  platform media capabilities in `src/core/platform/` (`image-source-port.ts`,
  `use-voice-recorder.ts`, `use-voice-player.ts`), wired at the composition root with a
  startup reconciliation sweep. Phase 7 added search, filters, sorting, pagination, and
  saved searches (`src/features/search/{domain,data,application}/`), reusing the Phase 1
  `notes`/`notes_fts` foundation with the documented `LIKE` fallback and the existing
  `saved_searches` table; the Search tab is a real screen. Phase 8 made the seeded
  built-in templates usable: read-only `TemplateUseCases`
  (`src/features/templates/application/template-use-cases.ts`) and a Templates screen
  (`app/templates.tsx`) that pre-fills the existing capture flow; notes are copy-on-create
  and keep no template relationship. Phase 9 added portable vault export and Markdown/
  Obsidian import (`src/features/vault/domain/{vault-format,markdown-import}.ts`,
  `src/features/vault/application/{export-vault,import-vault}.ts`) plus the
  `TransferFileSystemPort` (file/folder picking, recursive listing, write/copy into a
  picked directory). Export is a folder export (no ZIP; dependency unresolved), import is
  non-destructive (conflicts get new IDs), and restore means re-import into the current
  vault. Templates and saved searches also round-trip (identical seeded built-ins are
  skipped; user-data collisions are reported, never overwritten). Phase 10 added URL
  capture (`src/features/capture/domain/url.ts`,
  `src/features/capture/application/capture-use-cases.ts`) with best-effort metadata via
  `UrlMetadataPort` (no new dependency), Android share receiving via `ShareReceivePort`
  (`expo-sharing` first-party APIs, root listener → capture review), and read-only
  `DiagnosticsUseCases` in Settings. `app/` holds the tab shell, capture (text/template/
  URL/share review), note detail/edit, the link-target chooser, the voice-record screen,
  notebook/tag/template screens, the Settings data actions, and the Phase 0 diagnostics
  screen. `src/phase0/` is temporary feasibility code, kept because Android runtime
  verification is still outstanding; it may be removed once Phase 0 is accepted. `src/ui/` holds theme, strings, and shared components (including the
  wikilink-aware `note-content.tsx` and `attachment-section.tsx`).
- Tests live in `tests/` and run against a real SQLite via the SQLite port with
  `npm test` (`tsx` provides TypeScript + path-alias support; `node:sqlite` is the test
  driver). `npm run typecheck` and `npm run lint` must also pass.
- Do not build product features without following the phase plan in `ROADMAP.md`, and do
  not treat `src/phase0/` as production code.
