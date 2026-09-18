import type { Clock, IdGenerator } from '@/core';
import type { SqliteExecutor } from '@/core/db/sqlite-port';
import { normalizeTitleKey } from '@/features/notes/domain/note';

import {
  linkIdentityKey,
  type LinkInput,
  type LinkResolution,
  type NoteLink,
} from '../domain/note-link';

type LinkRow = {
  id: string;
  source_note_id: string;
  target_note_id: string | null;
  resolution: LinkResolution;
  target_text: string;
  display_text: string | null;
  anchor: string | null;
  created_at: string;
  updated_at: string;
};

function toLink(row: LinkRow): NoteLink {
  return {
    id: row.id,
    sourceNoteId: row.source_note_id,
    targetNoteId: row.target_note_id,
    resolution: row.resolution,
    targetText: row.target_text,
    displayText: row.display_text,
    anchor: row.anchor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
  SELECT id, source_note_id, target_note_id, resolution, target_text, display_text,
         anchor, created_at, updated_at
  FROM note_links
`;

export type LinkRepository = ReturnType<typeof createLinkRepository>;

export function createLinkRepository(deps: { newId: IdGenerator; now: Clock }) {
  const { newId, now } = deps;

  /**
   * Resolves or classifies links.
   *
   * Invariant (docs/DATABASE.md §4.5): only rows with `target_note_id IS NULL` are
   * touched. A resolved link is never re-pointed by title matching. Ambiguity (more than
   * one title match) never picks a note automatically.
   */
  async function resolveLinks(
    db: SqliteExecutor,
    scope: { ids?: string[]; sourceNoteId?: string } = {},
  ): Promise<number> {
    const where = ['target_note_id IS NULL'];
    const params: (string | number)[] = [];

    if (scope.ids) {
      if (scope.ids.length === 0) return 0;
      where.push(`id IN (${scope.ids.map(() => '?').join(', ')})`);
      params.push(...scope.ids);
    } else if (scope.sourceNoteId) {
      where.push('source_note_id = ?');
      params.push(scope.sourceNoteId);
    }

    const rows = await db.getAllAsync<{ id: string; target_text: string }>(
      `SELECT id, target_text FROM note_links WHERE ${where.join(' AND ')}`,
      params,
    );

    let updated = 0;
    for (const row of rows) {
      const matches = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM notes WHERE title_key = ? ORDER BY created_at ASC, id ASC LIMIT 2',
        [row.target_text],
      );

      if (matches.length === 1) {
        await db.runAsync(
          'UPDATE note_links SET target_note_id = ?, resolution = ?, updated_at = ? WHERE id = ?',
          [matches[0]!.id, 'resolved', now(), row.id],
        );
      } else {
        const resolution: LinkResolution = matches.length === 0 ? 'unresolved' : 'ambiguous';
        await db.runAsync(
          'UPDATE note_links SET target_note_id = NULL, resolution = ?, updated_at = ? WHERE id = ?',
          [resolution, now(), row.id],
        );
      }
      updated += 1;
    }
    return updated;
  }

  async function getById(db: SqliteExecutor, id: string): Promise<NoteLink | null> {
    const row = await db.getFirstAsync<LinkRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? toLink(row) : null;
  }

  async function listBySource(db: SqliteExecutor, sourceNoteId: string): Promise<NoteLink[]> {
    const rows = await db.getAllAsync<LinkRow>(
      `${SELECT} WHERE source_note_id = ? ORDER BY target_text ASC, id ASC`,
      [sourceNoteId],
    );
    return rows.map(toLink);
  }

  /** Every link row, ordered by source; used by vault export. */
  async function listAll(db: SqliteExecutor): Promise<NoteLink[]> {
    const rows = await db.getAllAsync<LinkRow>(
      `${SELECT} ORDER BY source_note_id ASC, target_text ASC, id ASC`,
    );
    return rows.map(toLink);
  }

  return {
    getById,
    resolveLinks,
    listAll,

    /**
     * Replaces all outgoing links of a note from parsed content.
     *
     * Already-resolved links keep their target when the same link identity still exists,
     * so an edit that does not change a link cannot silently re-point it. New/changed
     * links start unresolved and are classified by `resolveLinks`.
     */
    async replaceLinksForNote(
      db: SqliteExecutor,
      sourceNoteId: string,
      links: LinkInput[],
    ): Promise<NoteLink[]> {
      const existing = await db.getAllAsync<LinkRow>(`${SELECT} WHERE source_note_id = ?`, [
        sourceNoteId,
      ]);
      const prior = new Map<string, LinkRow>();
      for (const row of existing) {
        prior.set(linkIdentityKey(row.target_text, row.display_text, row.anchor), row);
      }

      await db.runAsync('DELETE FROM note_links WHERE source_note_id = ?', [sourceNoteId]);

      const seen = new Set<string>();
      const timestamp = now();
      for (const input of links) {
        const targetText = normalizeTitleKey(input.targetText);
        if (targetText.length === 0) continue;

        const displayText = input.displayText ?? null;
        const anchor = input.anchor ?? null;
        const key = linkIdentityKey(targetText, displayText, anchor);
        if (seen.has(key)) continue;
        seen.add(key);

        const previous = prior.get(key);
        const targetNoteId = previous?.target_note_id ?? null;
        await db.runAsync(
          `INSERT INTO note_links
             (id, source_note_id, target_note_id, resolution, target_text, display_text,
              anchor, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            sourceNoteId,
            targetNoteId,
            targetNoteId ? 'resolved' : 'unresolved',
            targetText,
            displayText,
            anchor,
            timestamp,
            timestamp,
          ],
        );
      }

      await resolveLinks(db, { sourceNoteId });
      return listBySource(db, sourceNoteId);
    },

    listBySource,

    /** Backlinks: notes that reference `targetNoteId` (docs/DATABASE.md §4.5). */
    async listBacklinks(db: SqliteExecutor, targetNoteId: string): Promise<NoteLink[]> {
      const rows = await db.getAllAsync<LinkRow>(
        `${SELECT} WHERE target_note_id = ? ORDER BY created_at ASC, id ASC`,
        [targetNoteId],
      );
      return rows.map(toLink);
    },

    async listUnresolved(db: SqliteExecutor): Promise<NoteLink[]> {
      const rows = await db.getAllAsync<LinkRow>(
        `${SELECT} WHERE target_note_id IS NULL ORDER BY target_text ASC, id ASC`,
      );
      return rows.map(toLink);
    },

    async listIdsByTarget(db: SqliteExecutor, targetNoteId: string): Promise<string[]> {
      const rows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM note_links WHERE target_note_id = ?',
        [targetNoteId],
      );
      return rows.map((row) => row.id);
    },

    /**
     * Resolves unresolved links that reference exactly this normalized target text.
     * Used after a note is created or renamed; already-resolved links are never touched.
     */
    async resolveByTargetText(db: SqliteExecutor, targetText: string): Promise<number> {
      const rows = await db.getAllAsync<{ id: string }>(
        'SELECT id FROM note_links WHERE target_note_id IS NULL AND target_text = ?',
        [targetText],
      );
      return resolveLinks(db, { ids: rows.map((row) => row.id) });
    },

    /** Manual resolution (used by a future ambiguous-link picker). */
    async setTarget(
      db: SqliteExecutor,
      linkId: string,
      targetNoteId: string | null,
    ): Promise<void> {
      await db.runAsync(
        'UPDATE note_links SET target_note_id = ?, resolution = ?, updated_at = ? WHERE id = ?',
        [targetNoteId, targetNoteId ? 'resolved' : 'unresolved', now(), linkId],
      );
    },
  };
}
