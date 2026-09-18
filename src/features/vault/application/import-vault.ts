import type { Clock, IdGenerator } from '@/core';
import type { AppFileSystemPort } from '@/core/fs/filesystem-port';
import type { SqliteConnection, SqliteExecutor } from '@/core/db/sqlite-port';
import type { AttachmentRepository } from '@/features/attachments/data/attachment-repository';
import type { PendingDeletionRepository } from '@/features/attachments/data/pending-deletion-repository';
import {
  attachmentKindForMime,
  buildRelativePath,
  mimeForFilename,
  resolveUniqueStoredFilename,
} from '@/features/attachments/domain/attachment-files';
import type { LinkRepository } from '@/features/links/data/note-link-repository';
import { linkIdentityKey, type LinkInput } from '@/features/links/domain/note-link';
import { parseWikilinks } from '@/features/links/domain/wikilink-parser';
import type { NoteRepository } from '@/features/notes/data/note-repository';
import { isCaptureType, type CaptureType } from '@/features/notes/domain/note';
import type { NotebookRepository } from '@/features/notebooks/data/notebook-repository';
import type { SavedSearchRepository } from '@/features/search/data/saved-search-repository';
import { isSavedSearchSort } from '@/features/search/domain/saved-search';
import type { TemplateRepository } from '@/features/templates/data/template-repository';
import {
  ensureFrontmatterTagsInContent,
  extractAttachmentCandidates,
  isSupportedAttachmentName,
  parseImportFile,
  rewriteAttachmentReferences,
  type ParsedImportFile,
} from '../domain/markdown-import';
import { MANIFEST_FILENAME, parseManifest, type VaultManifest } from '../domain/vault-format';
import type { StageReporter } from './export-vault';

export type NoteTagPort = {
  reconcile(db: SqliteExecutor, noteId: string, content: string): Promise<void>;
};

export type VaultImportSource =
  { kind: 'file'; name: string; uri: string } | { kind: 'directory'; uri: string };

export type VaultImportResult = {
  status: 'complete' | 'partial';
  importedNotes: number;
  importedAttachments: number;
  createdNotebooks: number;
  importedTemplates: number;
  importedSavedSearches: number;
  skippedFiles: { file: string; reason: string }[];
  conflicts: string[];
  warnings: string[];
};

export type VaultImporter = ReturnType<typeof createVaultImporter>;

type ImportDocument = {
  sourceName: string;
  parsed: ParsedImportFile;
  content: string;
  /** Assigned id (may be remapped on conflict). */
  noteId: string | null;
  notebookName: string | null;
};

type SourceFile = { relativePath: string; uri: string };

type PlannedAttachment = {
  id: string;
  noteId: string;
  kind: 'image' | 'audio' | 'file';
  relativePath: string;
  sourceUri: string;
  originalName: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
};

function stringAttribute(attributes: ParsedImportFile['attributes'], key: string): string | null {
  const value = attributes[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function captureTypeAttribute(attributes: ParsedImportFile['attributes']): CaptureType {
  const value = attributes.captureType;
  if (typeof value === 'string' && isCaptureType(value)) return value;
  return 'text';
}

function timestampAttribute(
  attributes: ParsedImportFile['attributes'],
  key: string,
): string | null {
  const value = attributes[key];
  if (typeof value !== 'string') return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function basenameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Markdown / Obsidian / vault import (docs/FEATURES.md §9.3, DATABASE.md §9.3).
 *
 * Files are copied into the vault before database writes, all note writes happen in one
 * transaction, and a failure cleans up the copied files (or queues them for deletion), so
 * the database never claims data whose files are missing. Conflicts never overwrite: a
 * colliding note ID or attachment path gets a new local identity and is reported.
 */
export function createVaultImporter(deps: {
  connection: SqliteConnection;
  fileSystem: AppFileSystemPort;
  notes: NoteRepository;
  notebooks: NotebookRepository;
  links: LinkRepository;
  attachments: AttachmentRepository;
  pendingDeletions: PendingDeletionRepository;
  templates: TemplateRepository;
  savedSearches: SavedSearchRepository;
  reconcileTags: NoteTagPort;
  newId: IdGenerator;
  now: Clock;
}) {
  const { connection, fileSystem, notes, notebooks, links, attachments, templates, savedSearches } =
    deps;

  async function readDocuments(source: VaultImportSource): Promise<{
    documents: ImportDocument[];
    attachmentSources: Map<string, SourceFile[]>;
    manifest: VaultManifest | null;
    skipped: { file: string; reason: string }[];
    warnings: string[];
  }> {
    const documents: ImportDocument[] = [];
    const attachmentSources = new Map<string, SourceFile[]>();
    const skipped: { file: string; reason: string }[] = [];
    const warnings: string[] = [];
    let manifest: VaultManifest | null = null;

    const addDocument = (sourceName: string, text: string, filename: string) => {
      const parsed = parseImportFile({ filename, text });
      documents.push({
        sourceName,
        parsed,
        content: parsed.body,
        noteId: parsed.requestedId,
        notebookName: stringAttribute(parsed.attributes, 'notebook'),
      });
    };

    if (source.kind === 'file') {
      try {
        addDocument(source.name, await fileSystem.readTextFile(source.uri), source.name);
      } catch {
        skipped.push({ file: source.name, reason: 'unreadable' });
      }
      return { documents, attachmentSources, manifest, skipped, warnings };
    }

    const files = await fileSystem.listFilesRecursive(source.uri);
    const manifestEntry = files.find((file) => basenameOf(file.relativePath) === MANIFEST_FILENAME);
    if (manifestEntry) {
      try {
        manifest = parseManifest(await fileSystem.readTextFile(manifestEntry.uri));
        if (!manifest) warnings.push('manifest-unreadable');
      } catch {
        warnings.push('manifest-unreadable');
      }
    }

    for (const file of files) {
      const basename = basenameOf(file.relativePath);
      if (isSupportedAttachmentName(basename)) {
        const key = basename.toLowerCase();
        const list = attachmentSources.get(key);
        if (list) list.push(file);
        else attachmentSources.set(key, [file]);
      }
    }

    for (const file of files) {
      const basename = basenameOf(file.relativePath);
      if (!basename.toLowerCase().endsWith('.md') || basename === MANIFEST_FILENAME) continue;
      try {
        addDocument(file.relativePath, await fileSystem.readTextFile(file.uri), basename);
      } catch {
        skipped.push({ file: file.relativePath, reason: 'unreadable' });
      }
    }

    return { documents, attachmentSources, manifest, skipped, warnings };
  }

  /** Deletes files copied for an import that failed; queues them if deletion fails. */
  async function cleanupCopied(paths: string[]): Promise<void> {
    for (const relativePath of paths) {
      try {
        await fileSystem.deleteVaultFile(relativePath);
      } catch {
        try {
          await connection.withTransactionAsync((tx) =>
            deps.pendingDeletions.enqueue(tx, relativePath, deps.now()),
          );
        } catch {
          // Reported later by the reconciliation sweep as an orphan.
        }
      }
    }
  }

  return async function importVault(
    source: VaultImportSource,
    options: { onStage?: StageReporter } = {},
  ): Promise<VaultImportResult> {
    const onStage = options.onStage ?? (() => undefined);
    const conflicts: string[] = [];

    onStage('reading');
    const { documents, attachmentSources, manifest, skipped, warnings } =
      await readDocuments(source);

    onStage('validating');

    const allocateNoteId = async (): Promise<string> => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = deps.newId();
        if (usedIds.has(candidate)) continue;
        if (await notes.getById(connection, candidate)) continue;
        return candidate;
      }
      throw new Error('vault-import-id-allocation-failed');
    };

    const allocateAttachmentId = async (): Promise<string> => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = deps.newId();
        if (plannedAttachmentIds.has(candidate)) continue;
        if (await attachments.getById(connection, candidate)) continue;
        return candidate;
      }
      throw new Error('vault-import-id-allocation-failed');
    };

    // Note IDs: preserve free IDs; a collision or in-import duplicate gets a new ID.
    const usedIds = new Set<string>();
    const idRemap = new Map<string, string>();
    for (const document of documents) {
      const requested = document.parsed.requestedId;
      if (!requested) continue;
      const existing = await notes.getById(connection, requested);
      if (existing || usedIds.has(requested)) {
        const replacement = await allocateNoteId();
        idRemap.set(requested, replacement);
        document.noteId = replacement;
        usedIds.add(replacement);
        conflicts.push(`note-id:${requested}`);
      } else {
        usedIds.add(requested);
      }
    }
    // Files without an ID still need a local identity before attachments are planned.
    for (const document of documents) {
      if (!document.noteId) {
        const id = await allocateNoteId();
        document.noteId = id;
        usedIds.add(id);
      }
    }
    const remapNoteId = (id: string | null): string | null => (id ? (idRemap.get(id) ?? id) : null);

    // Attachment destinations: never reuse an existing ID or path.
    const existingNames = new Set(await fileSystem.listVaultDirectory('attachments'));
    for (const row of await attachments.listAll(connection)) {
      existingNames.add(basenameOf(row.relativePath));
    }
    const plannedNames = new Set<string>();
    const plannedAttachmentIds = new Set<string>();
    const plannedAttachments: PlannedAttachment[] = [];
    const pathRemap = new Map<string, string>();
    const basenameToPath = new Map<string, string>();

    const uniqueDestination = (preferredName: string): string => {
      const taken = new Set([...existingNames, ...plannedNames].map((name) => name.toLowerCase()));
      const name = resolveUniqueStoredFilename(preferredName, taken);
      plannedNames.add(name);
      return name;
    };

    const planAttachment = async (input: {
      id?: string | null;
      noteId: string;
      sourceUri: string;
      originalName: string | null;
      mimeType: string | null;
      kind?: 'image' | 'audio' | 'file';
      width?: number | null;
      height?: number | null;
      durationMs?: number | null;
      createdAt?: string | null;
      preferredName?: string | null;
      sourcePath?: string | null;
    }): Promise<PlannedAttachment> => {
      const existing = input.id ? await attachments.getById(connection, input.id) : null;
      if (existing) conflicts.push(`attachment-id:${input.id}`);
      const id =
        existing || !input.id || plannedAttachmentIds.has(input.id)
          ? await allocateAttachmentId()
          : input.id;
      plannedAttachmentIds.add(id);

      const preferred = input.preferredName ?? input.originalName ?? `attachment-${id.slice(0, 8)}`;
      const storedName = uniqueDestination(preferred);
      const relativePath = buildRelativePath(storedName);

      if (input.sourcePath && input.sourcePath !== relativePath) {
        pathRemap.set(input.sourcePath, relativePath);
      }
      basenameToPath.set(basenameOf(preferred).toLowerCase(), relativePath);
      return {
        id,
        noteId: input.noteId,
        kind: input.kind ?? attachmentKindForMime(input.mimeType),
        relativePath,
        sourceUri: input.sourceUri,
        originalName: input.originalName,
        mimeType: input.mimeType,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        createdAt: input.createdAt ?? deps.now(),
      };
    };

    const importedNoteIds = new Set(
      documents.map((document) => document.noteId).filter((id): id is string => id !== null),
    );

    // 1. Manifest attachments: exact metadata when the file is present.
    for (const entry of manifest?.attachments ?? []) {
      const sourceFile = attachmentSources.get(basenameOf(entry.file).toLowerCase())?.[0] ?? null;
      const noteId = remapNoteId(entry.noteId);
      if (!sourceFile) {
        warnings.push(`missing-attachment:${entry.file}`);
        continue;
      }
      if (!noteId || !importedNoteIds.has(noteId)) {
        warnings.push(`orphan-attachment:${entry.file}`);
        continue;
      }
      plannedAttachments.push(
        await planAttachment({
          id: entry.id,
          noteId,
          sourceUri: sourceFile.uri,
          originalName: entry.originalName,
          mimeType: entry.mimeType,
          kind:
            entry.kind === 'image' || entry.kind === 'audio' || entry.kind === 'file'
              ? entry.kind
              : 'file',
          width: entry.width,
          height: entry.height,
          durationMs: entry.durationMs,
          createdAt: entry.createdAt,
          preferredName: basenameOf(entry.file),
          sourcePath: entry.file,
        }),
      );
    }

    // 2. Plain-folder attachments: one unique source referenced by at least one document.
    for (const [basename, matches] of attachmentSources) {
      if (matches.length !== 1) {
        warnings.push(`ambiguous-attachment:${basename}`);
        continue;
      }
      if (basenameToPath.has(basename)) continue;
      const source = matches[0]!;
      const referencing = documents.find((document) =>
        extractAttachmentCandidates(document.content).some(
          (candidate) => candidate.basename.toLowerCase() === basename,
        ),
      );
      if (!referencing?.noteId) continue;
      const mimeType = mimeForFilename(basename);
      plannedAttachments.push(
        await planAttachment({
          noteId: referencing.noteId,
          sourceUri: source.uri,
          originalName: basename,
          mimeType,
          kind: attachmentKindForMime(mimeType),
          preferredName: basename,
          sourcePath: source.relativePath,
        }),
      );
    }

    // Unreferenced files are not imported (no note owns them) but are reported so the
    // user knows they were left in the source folder — never silently discarded.
    const importedSourcePaths = new Set(plannedAttachments.map((entry) => entry.sourceUri));
    for (const matches of attachmentSources.values()) {
      for (const source of matches) {
        if (!importedSourcePaths.has(source.uri)) {
          warnings.push(`unreferenced-attachment:${source.relativePath}`);
        }
      }
    }

    // 3. Rewrite references to canonical planned paths; leave unresolvable refs verbatim.
    for (const document of documents) {
      for (const candidate of extractAttachmentCandidates(document.content)) {
        const key = candidate.basename.toLowerCase();
        if (!basenameToPath.has(key) && !attachmentSources.has(key)) {
          warnings.push(`missing-attachment:${candidate.basename}`);
        }
      }
      document.content = rewriteAttachmentReferences(
        document.content,
        (basename) => basenameToPath.get(basename.toLowerCase()) ?? null,
      );
      // Canonical `](path)` references only; a naive substring replace would corrupt
      // labels and already-rewritten paths.
      for (const [from, to] of pathRemap) {
        document.content = document.content.split(`](${from})`).join(`](${to})`);
      }
      document.content = ensureFrontmatterTagsInContent(
        document.content,
        document.parsed.frontmatterTags,
      ).content;
    }

    // Copy files into the vault before any database write.
    onStage('writing');
    const copiedVaultPaths: string[] = [];
    try {
      for (const attachment of plannedAttachments) {
        await fileSystem.copyIntoVault(attachment.sourceUri, attachment.relativePath);
        copiedVaultPaths.push(attachment.relativePath);
      }
    } catch (error) {
      await cleanupCopied(copiedVaultPaths);
      throw error;
    }

    onStage('finalizing');
    let importedNotes = 0;
    let createdNotebooks = 0;
    let importedTemplates = 0;
    let importedSavedSearches = 0;
    try {
      await connection.withTransactionAsync(async (tx) => {
        const notebookIdByName = new Map<string, string>();
        for (const notebook of await notebooks.list(tx)) {
          notebookIdByName.set(notebook.name.trim().toLowerCase(), notebook.id);
        }
        const manifestNotebookId = new Map<string, string>();

        for (const entry of manifest?.notebooks ?? []) {
          const existingById = await notebooks.getById(tx, entry.id);
          if (existingById) {
            manifestNotebookId.set(entry.id, existingById.id);
            continue;
          }
          const byName = notebookIdByName.get(entry.name.trim().toLowerCase());
          if (byName) {
            manifestNotebookId.set(entry.id, byName);
            conflicts.push(`notebook-name:${entry.name}`);
            continue;
          }
          await notebooks.create(tx, {
            id: entry.id,
            name: entry.name,
            sortOrder: entry.sortOrder,
            createdAt: entry.createdAt,
          });
          manifestNotebookId.set(entry.id, entry.id);
          notebookIdByName.set(entry.name.trim().toLowerCase(), entry.id);
          createdNotebooks += 1;
        }

        // Pass 1: create every note (and reconcile tags). Links are rebuilt in pass 2 so a
        // manifest-resolved target can point at a note that appears later in the batch
        // without violating the foreign key (docs/DATABASE.md §9.3 import order).
        for (const document of documents) {
          const noteId = document.noteId ?? (await allocateNoteId());
          const manifestNote = manifest?.notes.find(
            (entry) => entry.id === document.parsed.requestedId,
          );

          let notebookId: string | null = null;
          if (manifestNote?.notebookId) {
            notebookId = manifestNotebookId.get(manifestNote.notebookId) ?? null;
          } else if (document.notebookName) {
            notebookId = await resolveNotebookByName(tx, document.notebookName, notebookIdByName);
          }

          await notes.create(tx, {
            id: noteId,
            title: document.parsed.title,
            content: document.content,
            captureType: captureTypeAttribute(document.parsed.attributes),
            notebookId,
            sourceUrl: stringAttribute(document.parsed.attributes, 'sourceUrl'),
            createdAt:
              manifestNote?.createdAt ??
              timestampAttribute(document.parsed.attributes, 'createdAt') ??
              deps.now(),
            updatedAt:
              manifestNote?.updatedAt ??
              timestampAttribute(document.parsed.attributes, 'updatedAt') ??
              undefined,
            openedAt:
              manifestNote?.openedAt ?? timestampAttribute(document.parsed.attributes, 'openedAt'),
          });

          await deps.reconcileTags.reconcile(tx, noteId, document.content);
          importedNotes += 1;
        }

        // Pass 2: rebuild links now that every note exists, then apply explicit
        // manifest-resolved targets.
        for (const document of documents) {
          const noteId = document.noteId;
          if (!noteId) continue;
          const manifestNote = manifest?.notes.find(
            (entry) => entry.id === document.parsed.requestedId,
          );

          const createdLinks = await links.replaceLinksForNote(
            tx,
            noteId,
            toLinkInputs(document.content),
          );

          if (manifestNote) {
            const byIdentity = new Map(
              createdLinks.map((link) => [
                linkIdentityKey(link.targetText, link.displayText, link.anchor),
                link.id,
              ]),
            );
            for (const manifestLink of manifestNote.links) {
              const targetNoteId = remapNoteId(manifestLink.targetNoteId);
              if (manifestLink.resolution !== 'resolved' || !targetNoteId) continue;
              const linkId = byIdentity.get(
                linkIdentityKey(
                  manifestLink.targetText,
                  manifestLink.displayText,
                  manifestLink.anchor,
                ),
              );
              if (linkId) await links.setTarget(tx, linkId, targetNoteId);
            }
          }
        }

        // Resolve every still-unconnected link against the final note set.
        await links.resolveLinks(tx, {});

        // Templates: recreated from the manifest. A template whose ID already exists is
        // left untouched (built-ins are seeded and user edits are authoritative); a
        // colliding new ID gets a new local ID. Never touches notes.
        for (const entry of manifest?.templates ?? []) {
          const existing = await templates.getById(tx, entry.id);
          if (existing) {
            // Seeded built-ins are app policy, not user data: an identical built-in is
            // skipped silently. A collision with a user-edited/created template is a
            // real conflict and is reported without overwriting.
            if (existing.isBuiltin && entry.isBuiltin) continue;
            conflicts.push(`template-id:${entry.id}`);
            continue;
          }
          const existingByName = (await templates.list(tx)).find(
            (template) => template.name.trim().toLowerCase() === entry.name.trim().toLowerCase(),
          );
          if (existingByName) {
            conflicts.push(`template-name:${entry.name}`);
            continue;
          }
          await templates.create(tx, {
            id: entry.id,
            name: entry.name,
            description: entry.description,
            content: entry.content,
            isBuiltin: entry.isBuiltin,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
          importedTemplates += 1;
        }

        // Saved searches: rules only, recreated verbatim. Existing IDs are preserved and
        // skipped; a same-named saved search with a different ID is imported alongside it
        // (no silent overwrite). Never touches notes.
        for (const entry of manifest?.savedSearches ?? []) {
          const existing = await savedSearches.getById(tx, entry.id);
          if (existing) {
            conflicts.push(`saved-search-id:${entry.id}`);
            continue;
          }
          await savedSearches.create(tx, {
            id: entry.id,
            name: entry.name,
            query: entry.query,
            filters: entry.filters,
            sort: isSavedSearchSort(entry.sort) ? entry.sort : 'updated_desc',
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
          });
          importedSavedSearches += 1;
        }

        for (const attachment of plannedAttachments) {
          await attachments.create(tx, {
            id: attachment.id,
            noteId: attachment.noteId,
            kind: attachment.kind,
            relativePath: attachment.relativePath,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            byteSize: await fileSystem.vaultFileSize(attachment.relativePath),
            width: attachment.width,
            height: attachment.height,
            durationMs: attachment.durationMs,
            createdAt: attachment.createdAt,
          });
        }
      });
    } catch (error) {
      await cleanupCopied(copiedVaultPaths);
      throw error;
    }

    onStage('complete');
    return {
      status: skipped.length > 0 ? 'partial' : 'complete',
      importedNotes,
      importedAttachments: plannedAttachments.length,
      createdNotebooks,
      importedTemplates,
      importedSavedSearches,
      skippedFiles: skipped,
      conflicts,
      warnings,
    };

    async function resolveNotebookByName(
      tx: SqliteExecutor,
      name: string,
      cache: Map<string, string>,
    ): Promise<string> {
      const key = name.trim().toLowerCase();
      const existing = cache.get(key);
      if (existing) return existing;
      const created = await notebooks.create(tx, { name: name.trim() });
      cache.set(key, created.id);
      createdNotebooks += 1;
      return created.id;
    }
  };
}

function toLinkInputs(content: string): LinkInput[] {
  return parseWikilinks(content).map((link) => ({
    targetText: link.target,
    displayText: link.displayText,
    anchor: link.anchor,
  }));
}
