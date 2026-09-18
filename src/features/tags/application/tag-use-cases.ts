import type { SqliteConnection } from '@/core/db/sqlite-port';
import type { Note } from '@/features/notes/domain/note';

import type { TagRepository } from '../data/tag-repository';
import { appendTagToken, isValidTagName, parseTags, removeTagToken } from '../domain/tag-parser';
import { normalizeTagName, type Tag } from '../domain/tag';

/**
 * Ports toward the notes feature, wired at the composition root. Keeps the tags feature
 * free of the notes data layer.
 */
export type TagUseCaseNotesPort = {
  getNote(id: string): Promise<Note | null>;
  updateNote(id: string, patch: { content: string }): Promise<Note | null>;
};

export type TagUseCases = ReturnType<typeof createTagUseCases>;

export function createTagUseCases(deps: {
  connection: SqliteConnection;
  tags: TagRepository;
  notes: TagUseCaseNotesPort;
}) {
  const { connection, tags, notes } = deps;

  return {
    list(): Promise<Tag[]> {
      return tags.list(connection);
    },

    listForNote(noteId: string): Promise<Tag[]> {
      return tags.listForNote(connection, noteId);
    },

    /**
     * Adds a tag by appending its token to note content; reconciliation then updates
     * `note_tags`. Adding an already-present tag is a no-op.
     */
    async addTagToNote(noteId: string, rawName: string): Promise<Note | null> {
      const displayName = rawName.normalize('NFKC').trim();
      if (!isValidTagName(displayName)) {
        throw new Error('Tag name contains unsupported characters');
      }

      const note = await notes.getNote(noteId);
      if (!note) return null;

      const normalized = normalizeTagName(displayName);
      if (parseTags(note.content).some((tag) => tag.name === normalized)) return note;

      return notes.updateNote(noteId, { content: appendTagToken(note.content, displayName) });
    },

    /** Removes a tag token from content; a missing tag is a no-op. */
    async removeTagFromNote(noteId: string, name: string): Promise<Note | null> {
      const note = await notes.getNote(noteId);
      if (!note) return null;

      const content = removeTagToken(note.content, normalizeTagName(name));
      if (content === note.content) return note;
      return notes.updateNote(noteId, { content });
    },
  };
}
