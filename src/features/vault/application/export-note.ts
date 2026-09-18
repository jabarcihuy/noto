import type { FileSystemPort } from '@/core/fs/filesystem-port';
import type { SharePort } from '@/core/platform/share-port';
import type { Note } from '@/features/notes/domain/note';

import {
  buildExportFilename,
  countAttachmentReferences,
  serializeNoteMarkdown,
} from '../domain/note-markdown';

export type ExportNoteOptions = {
  dialogTitle?: string;
  tags?: string[];
  notebook?: string | null;
};

export type ExportNoteResult = {
  filename: string;
  uri: string;
  shared: boolean;
  attachmentReferenceCount: number;
};

export type ExportNote = ReturnType<typeof createExportNote>;

/**
 * Single-note Markdown export (docs/FEATURES.md §9.1, DATABASE.md §9.1).
 *
 * The note is never modified: the use-case only reads it and writes a new file. A failure
 * propagates so the UI can report it and the user can retry; the source note is untouched.
 */
export function createExportNote(deps: { fileSystem: FileSystemPort; share: SharePort }) {
  return async function exportNote(
    note: Note,
    options: ExportNoteOptions = {},
  ): Promise<ExportNoteResult> {
    const markdown = serializeNoteMarkdown(note, {
      tags: options.tags,
      notebook: options.notebook,
    });
    const filename = buildExportFilename(note);

    const directoryUri = await deps.fileSystem.createExportDirectory(`note-${note.id}`);
    const uri = await deps.fileSystem.writeTextFile(directoryUri, filename, markdown);

    const available = await deps.share.isAvailable();
    if (available) {
      await deps.share.shareFile(uri, {
        mimeType: 'text/markdown',
        dialogTitle: options.dialogTitle,
      });
    }

    return {
      filename,
      uri,
      shared: available,
      attachmentReferenceCount: countAttachmentReferences(note.content),
    };
  };
}
