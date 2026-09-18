import type { Clock, IdGenerator } from '@/core';
import type { Database } from '@/core/db/database';
import { createAppMetadataRepository } from '@/core/db/app-metadata-repository';
import { createAttachmentRepository } from '@/features/attachments/data/attachment-repository';
import { createPendingDeletionRepository } from '@/features/attachments/data/pending-deletion-repository';
import { createLinkRepository } from '@/features/links/data/note-link-repository';
import { createNotebookRepository } from '@/features/notebooks/data/notebook-repository';
import { createNoteRepository } from '@/features/notes/data/note-repository';
import { createSavedSearchRepository } from '@/features/search/data/saved-search-repository';
import { createTagRepository } from '@/features/tags/data/tag-repository';
import { createTemplateRepository } from '@/features/templates/data/template-repository';

/**
 * Builds every repository from one database handle. Pure (no platform imports) so tests
 * can use it with the Node SQLite driver and the app can use it with expo-sqlite.
 */
export function createRepositories(db: Database, deps: { newId: IdGenerator; now: Clock }) {
  return {
    notes: createNoteRepository({ index: db.searchIndex, ...deps }),
    notebooks: createNotebookRepository(deps),
    tags: createTagRepository(deps),
    links: createLinkRepository(deps),
    attachments: createAttachmentRepository(deps),
    pendingDeletions: createPendingDeletionRepository(deps),
    templates: createTemplateRepository(deps),
    savedSearches: createSavedSearchRepository(deps),
    appMetadata: createAppMetadataRepository(),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
