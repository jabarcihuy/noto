import type { Clock } from '@/core';
import type { SqliteConnection, SqliteExecutor } from '@/core/db/sqlite-port';
import type { LinkRepository } from '@/features/links/data/note-link-repository';

import type { NoteRepository } from '../data/note-repository';
import { normalizeTitleKey, type CaptureType, type Note, type NotePatch } from '../domain/note';
import { deleteNote } from './delete-note';

/**
 * Port for keeping tags consistent with note content, implemented by the tags feature and
 * wired at the composition root (docs/DATABASE.md §4.3).
 */
export type NoteTagPort = {
  reconcile(db: SqliteExecutor, noteId: string, content: string): Promise<void>;
};

/**
 * Port for keeping wikilinks consistent with note content and for resolving not-yet
 * connected links after a create/rename, implemented by the links feature
 * (docs/DATABASE.md §4.5).
 */
export type NoteLinkPort = {
  reconcile(db: SqliteExecutor, noteId: string, content: string): Promise<void>;
  resolveByTargetText(db: SqliteExecutor, targetText: string): Promise<void>;
};

/**
 * Minimum interval between `opened_at` writes. Opening the same note repeatedly should not
 * cause a database write every time (docs/DATABASE.md §4.2).
 */
export const OPEN_THROTTLE_MS = 60_000;

export function shouldTouchOpenedAt(
  openedAt: string | null,
  nowIso: string,
  throttleMs = OPEN_THROTTLE_MS,
): boolean {
  if (!openedAt) return true;
  const previous = Date.parse(openedAt);
  const current = Date.parse(nowIso);
  if (Number.isNaN(previous) || Number.isNaN(current)) return true;
  return current - previous >= throttleMs;
}

export type NoteUseCases = ReturnType<typeof createNoteUseCases>;

/**
 * Application layer for notes (docs/ARCHITECTURE.md §3.3). Owns transactions; the UI calls
 * only these operations and never the repositories or SQL directly.
 */
export function createNoteUseCases(deps: {
  connection: SqliteConnection;
  notes: NoteRepository;
  links: LinkRepository;
  reconcileTags: NoteTagPort;
  reconcileLinks: NoteLinkPort;
  now: Clock;
}) {
  const { connection, notes, links, reconcileTags, reconcileLinks, now } = deps;

  return {
    async createNote(input: {
      title?: string;
      content?: string;
      captureType?: CaptureType;
      notebookId?: string | null;
      sourceUrl?: string | null;
    }): Promise<Note> {
      return connection.withTransactionAsync(async (tx) => {
        const note = await notes.create(tx, input);
        await reconcileTags.reconcile(tx, note.id, note.content);
        await reconcileLinks.reconcile(tx, note.id, note.content);
        // A new title may satisfy unresolved references from other notes.
        await reconcileLinks.resolveByTargetText(tx, normalizeTitleKey(note.title));
        return note;
      });
    },

    async updateNote(id: string, patch: NotePatch): Promise<Note | null> {
      return connection.withTransactionAsync(async (tx) => {
        const note = await notes.update(tx, id, patch);
        if (note) {
          await reconcileTags.reconcile(tx, note.id, note.content);
          await reconcileLinks.reconcile(tx, note.id, note.content);
          // A rename may satisfy unresolved references; resolved links are never touched.
          await reconcileLinks.resolveByTargetText(tx, normalizeTitleKey(note.title));
        }
        return note;
      });
    },

    async getNote(id: string): Promise<Note | null> {
      return notes.getById(connection, id);
    },

    /**
     * Opens a note and refreshes `opened_at` when the throttle allows. Editing content
     * never touches `opened_at`; only this operation does.
     */
    async openNote(id: string): Promise<Note | null> {
      const note = await notes.getById(connection, id);
      if (!note) return null;
      if (!shouldTouchOpenedAt(note.openedAt, now())) return note;

      await connection.withTransactionAsync((tx) => notes.markOpened(tx, id));
      return notes.getById(connection, id);
    },

    async deleteNote(id: string): Promise<boolean> {
      return deleteNote(connection, { notes, links }, id);
    },

    async listRecentNotes(page: { limit?: number; offset?: number } = {}): Promise<Note[]> {
      return notes.listRecent(connection, page);
    },
  };
}
