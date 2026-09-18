import { createLinkUseCases } from '@/features/links/application/link-use-cases';
import { createNoteLinkReconciler } from '@/features/links/application/reconcile-note-links';
import { createNoteUseCases } from '@/features/notes/application/note-use-cases';
import { createNotebookUseCases } from '@/features/notebooks/application/notebook-use-cases';
import { createSearchRepository } from '@/features/search/data/search-repository';
import { createSearchUseCases } from '@/features/search/application/search-use-cases';
import { createNoteTagReconciler } from '@/features/tags/application/reconcile-note-tags';
import { createTagUseCases } from '@/features/tags/application/tag-use-cases';

import type { TestContext } from './context';

/**
 * Mirrors the composition root wiring for tests, so application behavior is exercised
 * through the same ports the app uses. `fts5Available` can be forced to exercise the
 * documented `LIKE` fallback.
 */
export function createTestServices(
  context: Pick<TestContext, 'connection' | 'repos' | 'now'>,
  options: { fts5Available?: boolean } = {},
) {
  const reconcileTags = createNoteTagReconciler(context.repos.tags);
  const reconcileLinks = createNoteLinkReconciler(context.repos.links);

  const notes = createNoteUseCases({
    connection: context.connection,
    notes: context.repos.notes,
    links: context.repos.links,
    reconcileTags,
    reconcileLinks,
    now: context.now,
  });

  const tags = createTagUseCases({
    connection: context.connection,
    tags: context.repos.tags,
    notes: {
      getNote: notes.getNote,
      updateNote: (id, patch) => notes.updateNote(id, patch),
    },
  });

  const notebooks = createNotebookUseCases({
    connection: context.connection,
    notebooks: context.repos.notebooks,
    noteList: { listByNotebook: context.repos.notes.listByNotebook },
  });

  const links = createLinkUseCases({
    connection: context.connection,
    links: context.repos.links,
    notes: {
      findByTitleKey: context.repos.notes.findByTitleKey,
      searchByTitlePrefix: context.repos.notes.searchByTitlePrefix,
      getManyByIds: context.repos.notes.getManyByIds,
      listRecent: context.repos.notes.listRecent,
    },
  });

  const search = createSearchUseCases({
    connection: context.connection,
    search: createSearchRepository(),
    savedSearches: context.repos.savedSearches,
    fts5Available: options.fts5Available ?? true,
  });

  return { notes, tags, notebooks, links, search };
}
