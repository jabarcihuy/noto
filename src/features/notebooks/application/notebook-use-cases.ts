import type { SqliteConnection, SqliteExecutor } from '@/core/db/sqlite-port';
import type { Note } from '@/features/notes/domain/note';

import type { NotebookRepository } from '../data/notebook-repository';
import type { Notebook } from '../domain/notebook';

/** Port toward the notes feature for reading a notebook's notes (read-only). */
export type NotebookNoteListPort = {
  listByNotebook(
    db: SqliteExecutor,
    notebookId: string,
    page?: { limit?: number; offset?: number },
  ): Promise<Note[]>;
};

export type NotebookUseCases = ReturnType<typeof createNotebookUseCases>;

export function createNotebookUseCases(deps: {
  connection: SqliteConnection;
  notebooks: NotebookRepository;
  noteList: NotebookNoteListPort;
}) {
  const { connection, notebooks, noteList } = deps;

  return {
    list(): Promise<Notebook[]> {
      return notebooks.list(connection);
    },

    getById(id: string): Promise<Notebook | null> {
      return notebooks.getById(connection, id);
    },

    create(name: string): Promise<Notebook> {
      return connection.withTransactionAsync((tx) => notebooks.create(tx, { name: name.trim() }));
    },

    rename(id: string, name: string): Promise<Notebook | null> {
      return connection.withTransactionAsync((tx) =>
        notebooks.update(tx, id, { name: name.trim() }),
      );
    },

    /** Deleting a notebook never deletes notes; FK sets notes.notebook_id = NULL. */
    remove(id: string): Promise<boolean> {
      return connection.withTransactionAsync((tx) => notebooks.remove(tx, id));
    },

    assignNote(noteId: string, notebookId: string): Promise<void> {
      return connection.withTransactionAsync((tx) => notebooks.assignNote(tx, noteId, notebookId));
    },

    removeNote(noteId: string): Promise<void> {
      return connection.withTransactionAsync((tx) => notebooks.removeNoteFromNotebook(tx, noteId));
    },

    listNotes(notebookId: string, page?: { limit?: number; offset?: number }): Promise<Note[]> {
      return noteList.listByNotebook(connection, notebookId, page);
    },
  };
}
