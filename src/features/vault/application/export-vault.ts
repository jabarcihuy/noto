import type { Clock } from '@/core';
import type { AppFileSystemPort } from '@/core/fs/filesystem-port';
import type { SqliteConnection } from '@/core/db/sqlite-port';
import type { AttachmentRepository } from '@/features/attachments/data/attachment-repository';
import type { LinkRepository } from '@/features/links/data/note-link-repository';
import type { NoteLink } from '@/features/links/domain/note-link';
import type { NotebookRepository } from '@/features/notebooks/data/notebook-repository';
import type { NoteRepository } from '@/features/notes/data/note-repository';
import type { SavedSearchRepository } from '@/features/search/data/saved-search-repository';
import type { TagRepository } from '@/features/tags/data/tag-repository';
import type { TemplateRepository } from '@/features/templates/data/template-repository';

import {
  MANIFEST_FILENAME,
  planVaultExport,
  serializeManifest,
  type VaultExportPlan,
} from '../domain/vault-format';

export type VaultStage =
  'preparing' | 'reading' | 'validating' | 'writing' | 'finalizing' | 'complete';
export type StageReporter = (stage: VaultStage) => void;

export type VaultExportResult = {
  destinationUri: string;
  usedFallback: boolean;
  noteCount: number;
  attachmentCount: number;
  missingAttachments: string[];
  warnings: string[];
  manifestPath: string;
};

export type VaultExporter = ReturnType<typeof createVaultExporter>;

/**
 * Full vault export (docs/FEATURES.md §9.2, DATABASE.md §9). Read-only with respect to the
 * live vault: it plans from the database, then writes notes, attachments, and the manifest
 * to a picked directory (or an app-private fallback). ZIP is intentionally not produced
 * (no first-party archive API; documented fallback is a folder export).
 */
export function createVaultExporter(deps: {
  connection: SqliteConnection;
  fileSystem: AppFileSystemPort;
  notes: NoteRepository;
  notebooks: NotebookRepository;
  tags: TagRepository;
  links: LinkRepository;
  attachments: AttachmentRepository;
  templates: TemplateRepository;
  savedSearches: SavedSearchRepository;
  now: Clock;
}) {
  const { connection, fileSystem } = deps;

  async function buildPlan(exportedAt: string): Promise<{
    plan: VaultExportPlan;
    missingAttachments: string[];
  }> {
    const [notes, notebooks, tags, links, attachments, templates, savedSearches, tagsByNote] =
      await Promise.all([
        deps.notes.list(connection, { limit: 1_000_000 }),
        deps.notebooks.list(connection),
        deps.tags.list(connection),
        deps.links.listAll(connection),
        deps.attachments.listAll(connection),
        deps.templates.list(connection),
        deps.savedSearches.list(connection),
        deps.tags.listNoteTagNames(connection),
      ]);

    const linksByNote = new Map<string, NoteLink[]>();
    for (const link of links) {
      const existing = linksByNote.get(link.sourceNoteId);
      if (existing) existing.push(link);
      else linksByNote.set(link.sourceNoteId, [link]);
    }

    const plan = planVaultExport({
      notes,
      notebooks,
      tags,
      tagsByNote,
      linksByNote,
      attachments,
      templates,
      savedSearches,
      exportedAt,
    });

    // A metadata row whose file is missing must not abort the export, but it must be
    // reported (docs/FEATURES.md §9.2).
    const missingAttachments: string[] = [];
    for (const attachment of plan.attachmentFiles) {
      if (!(await fileSystem.vaultFileExists(attachment.sourceVaultPath))) {
        missingAttachments.push(attachment.relativePath);
      }
    }

    return { plan, missingAttachments };
  }

  return async function exportVault(
    options: { onStage?: StageReporter } = {},
  ): Promise<VaultExportResult> {
    const onStage = options.onStage ?? (() => undefined);

    onStage('preparing');
    const exportedAt = deps.now();

    onStage('reading');
    const { plan, missingAttachments } = await buildPlan(exportedAt);

    onStage('validating');
    if (plan.errors.length > 0) {
      throw new Error(`vault-export-invalid:${plan.errors.join(',')}`);
    }

    onStage('writing');
    const picked = await fileSystem.pickDirectory();
    const usedFallback = picked === null;
    const destinationUri =
      picked ?? (await fileSystem.createFallbackExportDirectory(`vault-${Date.now()}`));

    for (const note of plan.noteFiles) {
      await fileSystem.writeFileAt(destinationUri, note.relativePath, note.markdown);
    }
    for (const attachment of plan.attachmentFiles) {
      if (missingAttachments.includes(attachment.relativePath)) continue;
      await fileSystem.copyVaultFileAt(
        destinationUri,
        attachment.relativePath,
        attachment.sourceVaultPath,
      );
    }
    const manifestPath = await fileSystem.writeFileAt(
      destinationUri,
      MANIFEST_FILENAME,
      serializeManifest(plan.manifest),
    );

    onStage('finalizing');
    // Verify the written backup is complete before reporting success.
    for (const note of plan.noteFiles) {
      if (!(await fileSystem.fileExistsAt(destinationUri, note.relativePath))) {
        throw new Error(`vault-export-missing-file:${note.relativePath}`);
      }
    }
    for (const attachment of plan.attachmentFiles) {
      if (missingAttachments.includes(attachment.relativePath)) continue;
      if (!(await fileSystem.fileExistsAt(destinationUri, attachment.relativePath))) {
        throw new Error(`vault-export-missing-file:${attachment.relativePath}`);
      }
    }
    if (!(await fileSystem.fileExistsAt(destinationUri, MANIFEST_FILENAME))) {
      throw new Error('vault-export-missing-manifest');
    }

    onStage('complete');
    return {
      destinationUri,
      usedFallback,
      noteCount: plan.noteFiles.length,
      attachmentCount: plan.attachmentFiles.length - missingAttachments.length,
      missingAttachments,
      warnings: plan.warnings,
      manifestPath,
    };
  };
}
