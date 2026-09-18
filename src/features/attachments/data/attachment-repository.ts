import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';

import type { Attachment, AttachmentKind, NewAttachment } from '../domain/attachment';

type AttachmentRow = {
  id: string;
  note_id: string;
  kind: AttachmentKind;
  relative_path: string;
  original_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
};

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    noteId: row.note_id,
    kind: row.kind,
    relativePath: row.relative_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

const SELECT = `
  SELECT id, note_id, kind, relative_path, original_name, mime_type, byte_size,
         width, height, duration_ms, created_at
  FROM attachments
`;

export type AttachmentRepository = ReturnType<typeof createAttachmentRepository>;

export function createAttachmentRepository(deps: { newId: IdGenerator; now: Clock }) {
  const { newId, now } = deps;

  async function getById(db: SqliteExecutor, id: string): Promise<Attachment | null> {
    const row = await db.getFirstAsync<AttachmentRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toAttachment(row) : null;
  }

  return {
    getById,

    /** Metadata only; the caller must have written the file first (docs/DATABASE.md §7.1). */
    async create(db: SqliteExecutor, input: NewAttachment): Promise<Attachment> {
      const id = input.id ?? newId();
      await db.runAsync(
        `INSERT INTO attachments
           (id, note_id, kind, relative_path, original_name, mime_type, byte_size,
            width, height, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.noteId,
          input.kind,
          input.relativePath,
          input.originalName ?? null,
          input.mimeType ?? null,
          input.byteSize ?? null,
          input.width ?? null,
          input.height ?? null,
          input.durationMs ?? null,
          input.createdAt ?? now(),
        ],
      );
      const attachment = await getById(db, id);
      if (!attachment) throw new Error(`Attachment ${id} was inserted but could not be read back`);
      return attachment;
    },

    async listForNote(db: SqliteExecutor, noteId: string): Promise<Attachment[]> {
      const rows = await db.getAllAsync<AttachmentRow>(
        `${SELECT} WHERE note_id = ? ORDER BY created_at ASC, id ASC`,
        [noteId],
      );
      return rows.map(toAttachment);
    },

    async listAll(db: SqliteExecutor): Promise<Attachment[]> {
      const rows = await db.getAllAsync<AttachmentRow>(`${SELECT} ORDER BY created_at ASC, id ASC`);
      return rows.map(toAttachment);
    },

    /** Removes metadata only; file cleanup is queued by the storage phase (§7.3). */
    async remove(db: SqliteExecutor, id: string): Promise<boolean> {
      const result = await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}
