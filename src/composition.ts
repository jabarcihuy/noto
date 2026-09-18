import * as Crypto from 'expo-crypto';

import { nowIso } from '@/core';
import { openDatabase, type Database } from '@/core/db/database';
import { createExpoConnection } from '@/core/db/expo-connection';
import { createExpoFileSystem } from '@/core/fs/expo-filesystem';
import {
  createAttachmentUseCases,
  type AttachmentUseCases,
} from '@/features/attachments/application/attachment-use-cases';
import { createLinkUseCases, type LinkUseCases } from '@/features/links/application/link-use-cases';
import { createNoteLinkReconciler } from '@/features/links/application/reconcile-note-links';
import {
  createNotebookUseCases,
  type NotebookUseCases,
} from '@/features/notebooks/application/notebook-use-cases';
import { createExpoImageSource } from '@/core/platform/expo-image-source';
import type { ImageSourcePort } from '@/core/platform/image-source-port';
import {
  createSearchRepository,
  createSearchUseCases,
  type SearchUseCases,
} from '@/features/search';
import {
  createTemplateUseCases,
  type TemplateUseCases,
} from '@/features/templates/application/template-use-cases';
import { createExpoShare } from '@/core/platform/expo-share';
import { createExpoShareReceive } from '@/core/platform/expo-share-receive';
import type { ShareReceivePort } from '@/core/platform/share-receive-port';
import { createFetchUrlMetadata } from '@/core/platform/expo-url-metadata';
import {
  createCaptureUseCases,
  type CaptureUseCases,
} from '@/features/capture/application/capture-use-cases';
import {
  createDiagnosticsUseCases,
  type DiagnosticsUseCases,
} from '@/features/diagnostics/application/diagnostics-use-cases';
import { createNoteUseCases, type NoteUseCases } from '@/features/notes/application/note-use-cases';
import { createNoteTagReconciler } from '@/features/tags/application/reconcile-note-tags';
import { createTagUseCases, type TagUseCases } from '@/features/tags/application/tag-use-cases';
import { seedBuiltInTemplates } from '@/features/templates/data/seed-builtin-templates';
import { createExportNote, type ExportNote } from '@/features/vault/application/export-note';
import { createVaultExporter } from '@/features/vault/application/export-vault';
import { createVaultImporter } from '@/features/vault/application/import-vault';
import {
  createVaultUseCases,
  type VaultUseCases,
} from '@/features/vault/application/vault-use-cases';
import { createRepositories, type Repositories } from '@/repositories';

/**
 * Single composition root (docs/ARCHITECTURE.md §4.5). This is the only place that
 * constructs concrete adapters and injects them into repositories and use-cases.
 *
 * `initializeAppDatabase` is idempotent: repeated or concurrent calls share one
 * initialization, so the database opens exactly once per app lifecycle. The UI never
 * calls this directly; the app provider does, and screens call the resulting use-cases.
 */

export type AppServices = {
  database: Database;
  repositories: Repositories;
  notes: NoteUseCases;
  notebooks: NotebookUseCases;
  tags: TagUseCases;
  links: LinkUseCases;
  attachments: AttachmentUseCases;
  /** Gallery/camera capability (image picking only; voice uses platform hooks). */
  media: ImageSourcePort;
  /** Android/iOS share receiving (development/standalone builds only). */
  shareReceive: ShareReceivePort;
  capture: CaptureUseCases;
  diagnostics: DiagnosticsUseCases;
  search: SearchUseCases;
  templates: TemplateUseCases;
  vault: VaultUseCases;
  exportNote: ExportNote;
};

let initialization: Promise<AppServices> | null = null;

export function initializeAppDatabase(databaseName = 'noto.db'): Promise<AppServices> {
  if (!initialization) {
    initialization = (async () => {
      const connection = await createExpoConnection(databaseName);
      const database = await openDatabase(connection);

      await database.connection.withTransactionAsync(async (tx) => {
        await seedBuiltInTemplates(tx, nowIso);
      });

      const newId = () => Crypto.randomUUID();
      const repositories = createRepositories(database, { newId, now: nowIso });

      const reconcileTags = createNoteTagReconciler(repositories.tags);
      const reconcileLinks = createNoteLinkReconciler(repositories.links);
      const notes = createNoteUseCases({
        connection: database.connection,
        notes: repositories.notes,
        links: repositories.links,
        reconcileTags,
        reconcileLinks,
        now: nowIso,
      });
      const links = createLinkUseCases({
        connection: database.connection,
        links: repositories.links,
        notes: {
          findByTitleKey: repositories.notes.findByTitleKey,
          searchByTitlePrefix: repositories.notes.searchByTitlePrefix,
          getManyByIds: repositories.notes.getManyByIds,
          listRecent: repositories.notes.listRecent,
        },
      });
      const tags = createTagUseCases({
        connection: database.connection,
        tags: repositories.tags,
        notes: {
          getNote: notes.getNote,
          updateNote: (id, patch) => notes.updateNote(id, patch),
        },
      });
      const notebooks = createNotebookUseCases({
        connection: database.connection,
        notebooks: repositories.notebooks,
        noteList: { listByNotebook: repositories.notes.listByNotebook },
      });
      const fileSystem = createExpoFileSystem();
      const attachments = createAttachmentUseCases({
        connection: database.connection,
        attachments: repositories.attachments,
        pendingDeletions: repositories.pendingDeletions,
        fileSystem,
        notes: {
          getById: repositories.notes.getById,
          updateContent: (db, id, content) => repositories.notes.update(db, id, { content }),
        },
        newId,
        now: nowIso,
      });
      const media = createExpoImageSource();
      const shareReceive = createExpoShareReceive();
      const diagnostics = createDiagnosticsUseCases({
        connection: database.connection,
        schemaVersion: database.schemaVersion,
        fts5: database.capabilities.fts5,
      });
      const capture = createCaptureUseCases({
        notes: {
          createNote: (input) => notes.createNote(input),
          getNote: (id) => notes.getNote(id),
          updateNote: (id, patch) => notes.updateNote(id, patch),
          deleteNote: (id) => notes.deleteNote(id),
        },
        attachments,
        urlMetadata: createFetchUrlMetadata(),
        now: nowIso,
      });
      const search = createSearchUseCases({
        connection: database.connection,
        search: createSearchRepository(),
        savedSearches: repositories.savedSearches,
        fts5Available: database.capabilities.fts5,
      });
      const templates = createTemplateUseCases({
        connection: database.connection,
        templates: repositories.templates,
      });
      const vault = createVaultUseCases({
        fileSystem,
        exportVault: createVaultExporter({
          connection: database.connection,
          fileSystem,
          notes: repositories.notes,
          notebooks: repositories.notebooks,
          tags: repositories.tags,
          links: repositories.links,
          attachments: repositories.attachments,
          templates: repositories.templates,
          savedSearches: repositories.savedSearches,
          now: nowIso,
        }),
        importVault: createVaultImporter({
          connection: database.connection,
          fileSystem,
          notes: repositories.notes,
          notebooks: repositories.notebooks,
          links: repositories.links,
          attachments: repositories.attachments,
          pendingDeletions: repositories.pendingDeletions,
          templates: repositories.templates,
          savedSearches: repositories.savedSearches,
          reconcileTags,
          newId,
          now: nowIso,
        }),
      });
      const exportNote = createExportNote({
        fileSystem,
        share: createExpoShare(),
      });

      // Startup reconciliation sweep (docs/DATABASE.md §7.3): retry queued deletions and
      // report missing/orphan attachment files. It must not block the UI on large vaults,
      // so it runs in the background and only logs a summary.
      void attachments
        .reconcile()
        .then((report) => {
          if (
            report.orphan.length > 0 ||
            report.missing.length > 0 ||
            report.pendingRemaining > 0
          ) {
            console.warn('[Noto] attachment reconciliation', report);
          }
        })
        .catch((error: unknown) => {
          console.warn('[Noto] attachment reconciliation failed', error);
        });

      return {
        database,
        repositories,
        notes,
        notebooks,
        tags,
        links,
        attachments,
        media,
        shareReceive,
        capture,
        diagnostics,
        search,
        templates,
        vault,
        exportNote,
      };
    })().catch((error: unknown) => {
      // Allow a later retry to re-attempt initialization.
      initialization = null;
      throw error;
    });
  }
  return initialization;
}

export async function closeAppDatabase(): Promise<void> {
  if (!initialization) return;
  const app = await initialization;
  initialization = null;
  await app.database.close();
}
