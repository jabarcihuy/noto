import { createNoteTagReconciler } from '@/features/tags/application/reconcile-note-tags';
import { createVaultExporter } from '@/features/vault/application/export-vault';
import { createVaultImporter } from '@/features/vault/application/import-vault';
import { createVaultUseCases } from '@/features/vault/application/vault-use-cases';

import type { TestContext } from './context';
import type { FakeFileSystem } from './fake-filesystem';

/** Mirrors the composition-root wiring for vault export/import in tests. */
export function createTestVault(context: TestContext, fileSystem: FakeFileSystem) {
  const reconcileTags = createNoteTagReconciler(context.repos.tags);

  return createVaultUseCases({
    fileSystem: fileSystem.port,
    exportVault: createVaultExporter({
      connection: context.connection,
      fileSystem: fileSystem.port,
      notes: context.repos.notes,
      notebooks: context.repos.notebooks,
      tags: context.repos.tags,
      links: context.repos.links,
      attachments: context.repos.attachments,
      templates: context.repos.templates,
      savedSearches: context.repos.savedSearches,
      now: context.now,
    }),
    importVault: createVaultImporter({
      connection: context.connection,
      fileSystem: fileSystem.port,
      notes: context.repos.notes,
      notebooks: context.repos.notebooks,
      links: context.repos.links,
      attachments: context.repos.attachments,
      pendingDeletions: context.repos.pendingDeletions,
      templates: context.repos.templates,
      savedSearches: context.repos.savedSearches,
      reconcileTags,
      newId: context.newId,
      now: context.now,
    }),
  });
}
