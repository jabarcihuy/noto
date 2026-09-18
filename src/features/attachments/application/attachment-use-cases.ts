import type { Clock, IdGenerator } from '@/core';
import type { VaultFileSystemPort } from '@/core/fs/filesystem-port';
import type { SqliteConnection, SqliteExecutor } from '@/core/db/sqlite-port';
import type { Note } from '@/features/notes/domain/note';

import type { AttachmentRepository } from '../data/attachment-repository';
import type { PendingDeletionRepository } from '../data/pending-deletion-repository';
import type { Attachment, AttachmentKind } from '../domain/attachment';
import {
  appendAttachmentReference,
  ATTACHMENTS_DIRECTORY,
  buildAudioReference,
  buildImageReference,
  buildRelativePath,
  buildStoredFilename,
  removeAttachmentReferences,
  resolveUniqueStoredFilename,
} from '../domain/attachment-files';
import { classifyVaultFiles } from '../domain/reconcile';

/** Read/update access to notes, narrowed so attachments never write tags/links directly. */
export type AttachmentNotePort = {
  getById(db: SqliteExecutor, id: string): Promise<Note | null>;
  updateContent(db: SqliteExecutor, id: string, content: string): Promise<Note | null>;
};

export type NewImageSource = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
};

export type AttachmentView = {
  attachment: Attachment;
  /** False when the metadata row exists but the file is gone (PRD §18). */
  available: boolean;
  /** Absolute URI for display/playback; never persisted. */
  uri: string;
};

export type AttachmentReconciliationReport = {
  deletedPending: number;
  pendingRemaining: number;
  matched: number;
  missing: string[];
  orphan: string[];
};

export type AttachmentUseCases = ReturnType<typeof createAttachmentUseCases>;

/**
 * Attachment application layer (docs/FEATURES.md §8, docs/DATABASE.md §7). Owns the
 * file-then-metadata ordering, content references, deletion queueing, and reconciliation.
 * The UI never touches the filesystem or `attachments` SQL directly.
 */
export function createAttachmentUseCases(deps: {
  connection: SqliteConnection;
  attachments: AttachmentRepository;
  pendingDeletions: PendingDeletionRepository;
  fileSystem: VaultFileSystemPort;
  notes: AttachmentNotePort;
  newId: IdGenerator;
  now: Clock;
}) {
  const { connection, attachments, pendingDeletions, fileSystem, notes, newId, now } = deps;

  async function existingStoredNames(tx: SqliteExecutor): Promise<Set<string>> {
    const names = await fileSystem.listVaultDirectory(ATTACHMENTS_DIRECTORY);
    const dbPaths = (await attachments.listAll(tx)).map((row) => row.relativePath);
    const fromDb = dbPaths.map((path) => path.slice(`${ATTACHMENTS_DIRECTORY}/`.length));
    return new Set([...names, ...fromDb]);
  }

  /** Deletes a just-written file; if that fails, queues it so cleanup is recoverable. */
  async function cleanupFailedWrite(relativePath: string): Promise<void> {
    try {
      await fileSystem.deleteVaultFile(relativePath);
    } catch {
      try {
        await connection.withTransactionAsync((tx) =>
          pendingDeletions.enqueue(tx, relativePath, now()),
        );
      } catch {
        // Nothing else can be done here; reconciliation will still see the orphan file.
      }
    }
  }

  async function add(options: {
    noteId: string;
    kind: Extract<AttachmentKind, 'image' | 'audio'>;
    sourceUri: string;
    mimeType: string | null;
    originalName: string | null;
    width?: number | null;
    height?: number | null;
    durationMs?: number | null;
    buildReference: (relativePath: string) => string;
    /** When true the source is an http(s) URL downloaded straight into the vault. */
    download?: boolean;
  }): Promise<Attachment> {
    const note = await notes.getById(connection, options.noteId);
    if (!note) throw new Error('attachment-note-not-found');

    const id = newId();
    const desired = buildStoredFilename({
      originalName: options.originalName,
      mimeType: options.mimeType,
      attachmentId: id,
    });
    const taken = await existingStoredNames(connection);
    const storedName = resolveUniqueStoredFilename(desired, taken);
    const relativePath = buildRelativePath(storedName);

    let byteSize: number | null = null;
    try {
      if (options.download) {
        const downloaded = await fileSystem.downloadIntoVault(options.sourceUri, relativePath);
        byteSize = downloaded.byteSize;
      } else {
        const copied = await fileSystem.copyIntoVault(options.sourceUri, relativePath);
        byteSize = copied.byteSize;
      }
    } catch (error) {
      // A partial copy (if any) is removed so no untracked file is left behind.
      await cleanupFailedWrite(relativePath);
      throw error;
    }

    try {
      const attachment = await connection.withTransactionAsync(async (tx) => {
        const created = await attachments.create(tx, {
          id,
          noteId: options.noteId,
          kind: options.kind,
          relativePath,
          originalName: options.originalName,
          mimeType: options.mimeType,
          byteSize,
          width: options.width ?? null,
          height: options.height ?? null,
          durationMs: options.durationMs ?? null,
        });
        const current = await notes.getById(tx, options.noteId);
        if (current) {
          await notes.updateContent(
            tx,
            options.noteId,
            appendAttachmentReference(current.content, options.buildReference(relativePath)),
          );
        }
        return created;
      });
      return attachment;
    } catch (error) {
      // Metadata write failed: the file must not survive untracked.
      await cleanupFailedWrite(relativePath);
      throw error;
    }
  }

  return {
    async listForNote(noteId: string): Promise<AttachmentView[]> {
      const rows = await attachments.listForNote(connection, noteId);
      return Promise.all(
        rows.map(async (attachment) => ({
          attachment,
          available: await fileSystem.vaultFileExists(attachment.relativePath),
          uri: fileSystem.vaultUri(attachment.relativePath),
        })),
      );
    },

    async addImage(input: { noteId: string; source: NewImageSource }): Promise<Attachment> {
      const mimeType = input.source.mimeType ?? null;
      const alt = input.source.fileName ?? 'image';
      return add({
        noteId: input.noteId,
        kind: 'image',
        sourceUri: input.source.uri,
        mimeType,
        originalName: input.source.fileName ?? null,
        width: input.source.width ?? null,
        height: input.source.height ?? null,
        buildReference: (relativePath) => buildImageReference(relativePath, alt),
      });
    },

    async addAudio(input: {
      noteId: string;
      sourceUri: string;
      mimeType?: string | null;
      originalName?: string | null;
      durationMs?: number | null;
    }): Promise<Attachment> {
      const label = input.originalName ?? 'audio';
      return add({
        noteId: input.noteId,
        kind: 'audio',
        sourceUri: input.sourceUri,
        mimeType: input.mimeType ?? 'audio/mp4',
        originalName: input.originalName ?? null,
        durationMs: input.durationMs ?? null,
        buildReference: (relativePath) => buildAudioReference(relativePath, label),
      });
    },

    /**
     * Downloads a remote image (URL preview) into the vault and records it as a normal
     * image attachment, so export/import and reconciliation treat it like any other file.
     */
    async addImageFromUrl(input: {
      noteId: string;
      url: string;
      originalName?: string | null;
    }): Promise<Attachment> {
      const label = input.originalName ?? 'preview';
      return add({
        noteId: input.noteId,
        kind: 'image',
        sourceUri: input.url,
        mimeType: null,
        originalName: input.originalName ?? null,
        buildReference: (relativePath) => buildImageReference(relativePath, label),
        download: true,
      });
    },

    /**
     * Deletes metadata and queues the file for deletion in the same transaction, then
     * deletes the file and clears the queue. A failed file delete leaves the queue row for
     * the reconciliation sweep (docs/DATABASE.md §7.3).
     */
    async remove(attachmentId: string): Promise<boolean> {
      const attachment = await attachments.getById(connection, attachmentId);
      if (!attachment) return false;

      await connection.withTransactionAsync(async (tx) => {
        await pendingDeletions.enqueue(tx, attachment.relativePath, now());
        await attachments.remove(tx, attachment.id);
        const note = await notes.getById(tx, attachment.noteId);
        if (note) {
          await notes.updateContent(
            tx,
            note.id,
            removeAttachmentReferences(note.content, attachment.relativePath),
          );
        }
      });

      try {
        await fileSystem.deleteVaultFile(attachment.relativePath);
        await connection.withTransactionAsync((tx) =>
          pendingDeletions.remove(tx, attachment.relativePath),
        );
      } catch {
        // Keep the queue row; the sweep retries.
      }
      return true;
    },

    /** Best-effort removal of a discarded temporary recording (never in the vault). */
    async discardTempFile(uri: string): Promise<void> {
      await fileSystem.deleteUri(uri);
    },

    /**
     * Reconciliation sweep (docs/DATABASE.md §7.3): retries queued deletions, then
     * classifies vault files against metadata. Orphans are reported, never deleted.
     */
    async reconcile(): Promise<AttachmentReconciliationReport> {
      const queued = await pendingDeletions.list(connection);
      let deletedPending = 0;
      const remaining: string[] = [];

      for (const relativePath of queued) {
        try {
          await fileSystem.deleteVaultFile(relativePath);
          await connection.withTransactionAsync((tx) => pendingDeletions.remove(tx, relativePath));
          deletedPending += 1;
        } catch {
          remaining.push(relativePath);
        }
      }

      const dbPaths = (await attachments.listAll(connection)).map((row) => row.relativePath);
      const fileNames = await fileSystem.listVaultDirectory(ATTACHMENTS_DIRECTORY);
      const classification = classifyVaultFiles(dbPaths, fileNames, remaining);

      return {
        deletedPending,
        pendingRemaining: remaining.length,
        matched: classification.matched.length,
        missing: classification.missing,
        orphan: classification.orphan,
      };
    },
  };
}
