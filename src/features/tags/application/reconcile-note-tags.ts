import type { SqliteExecutor } from '@/core/db/sqlite-port';

import type { TagRepository } from '../data/tag-repository';
import { parseTags } from '../domain/tag-parser';

/**
 * Port the notes feature depends on to keep tags consistent with note content, without
 * importing the tags data layer (docs/ARCHITECTURE.md §4).
 */
export type NoteTagReconciler = {
  reconcile(db: SqliteExecutor, noteId: string, content: string): Promise<void>;
};

/**
 * Reconciles `note_tags` to exactly the tags parsed from note content (docs/DATABASE.md
 * §4.3). Removes assignments no longer present; never deletes `tags` rows.
 */
export function createNoteTagReconciler(tags: TagRepository): NoteTagReconciler {
  return {
    async reconcile(db, noteId, content) {
      const parsed = parseTags(content);

      const desiredIds = new Set<string>();
      for (const tag of parsed) {
        const stored = await tags.findOrCreate(db, tag.displayName);
        desiredIds.add(stored.id);
      }

      const existing = await tags.listForNote(db, noteId);
      const existingIds = new Set(existing.map((tag) => tag.id));

      for (const tag of existing) {
        if (!desiredIds.has(tag.id)) await tags.removeFromNote(db, noteId, tag.id);
      }
      for (const tagId of desiredIds) {
        if (!existingIds.has(tagId)) await tags.attachToNote(db, noteId, tagId);
      }
    },
  };
}
