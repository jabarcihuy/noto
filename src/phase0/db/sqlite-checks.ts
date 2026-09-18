import * as SQLite from 'expo-sqlite';

import { type CheckResult, errorMessage, fail, info, ok } from '../types';

const DB_NAME = 'noto-phase0-check.db';

async function runFts5Checks(db: SQLite.SQLiteDatabase): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const find = async (query: string): Promise<string[]> => {
    const rows = await db.getAllAsync<{ note_id: string }>(
      'SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?',
      [query],
    );
    return rows.map((row) => row.note_id);
  };

  try {
    await db.execAsync('DROP TABLE IF EXISTS notes_fts;');
    await db.execAsync(
      "CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, content, tokenize = 'unicode61');",
    );
    results.push(
      ok('fts5.create', "CREATE VIRTUAL TABLE ... USING fts5(..., tokenize='unicode61') berhasil"),
    );
  } catch (error) {
    results.push(
      fail(
        'fts5.create',
        `FTS5 tidak tersedia di runtime ini: ${errorMessage(error)}. Arsitektur wajib memakai fallback LIKE.`,
      ),
    );
    return results;
  }

  try {
    await db.runAsync('INSERT INTO notes_fts (note_id, title, content) VALUES (?, ?, ?)', [
      'n1',
      'Belajar Bahasa',
      'Panduan java untuk pemula',
    ]);
    await db.runAsync('INSERT INTO notes_fts (note_id, title, content) VALUES (?, ?, ?)', [
      'n2',
      'Café Note',
      'naïve résumé 日本語',
    ]);
    results.push(ok('fts5.insert', 'Menambahkan 2 baris'));
  } catch (error) {
    results.push(fail('fts5.insert', errorMessage(error)));
    return results;
  }

  try {
    const belajar = await find('belajar');
    results.push(
      belajar.includes('n1')
        ? ok('fts5.match.unicode', "MATCH 'belajar' menemukan n1", belajar.join(','))
        : fail('fts5.match.unicode', `MATCH 'belajar' -> [${belajar.join(',')}]`),
    );
  } catch (error) {
    results.push(fail('fts5.match.unicode', errorMessage(error)));
  }

  try {
    const accented = await find('café');
    const folded = await find('cafe');
    const japanese = await find('日本語');
    results.push(
      info(
        'fts5.match.accents',
        `unicode61 accent folding: café=${accented.length}, cafe=${folded.length}`,
        `cafe->[${folded.join(',')}]`,
      ),
    );
    results.push(
      info('fts5.match.cjk', `CJK '日本語' -> [${japanese.join(',')}]`, japanese.length),
    );
  } catch (error) {
    results.push(fail('fts5.match.accents', errorMessage(error)));
  }

  try {
    await db.runAsync('UPDATE notes_fts SET content = ? WHERE note_id = ?', [
      'materi baru tentang kopi',
      'n1',
    ]);
    const oldTerm = await find('java');
    const newTerm = await find('kopi');
    const updateOk = !oldTerm.includes('n1') && newTerm.includes('n1');
    results.push(
      updateOk
        ? ok('fts5.update', 'UPDATE baris memperbarui hasil MATCH')
        : fail('fts5.update', `java->[${oldTerm.join(',')}] kopi->[${newTerm.join(',')}]`),
    );
  } catch (error) {
    results.push(fail('fts5.update', errorMessage(error)));
  }

  try {
    await db.runAsync('DELETE FROM notes_fts WHERE note_id = ?', ['n2']);
    const deleted = await find('café');
    results.push(
      deleted.length === 0
        ? ok('fts5.delete', 'DELETE baris menghapus hasil MATCH')
        : fail('fts5.delete', `masih menemukan [${deleted.join(',')}]`),
    );
  } catch (error) {
    results.push(fail('fts5.delete', errorMessage(error)));
  }

  return results;
}

/**
 * Runtime feasibility checks for expo-sqlite (docs/DATABASE.md §4, §6).
 */
export async function runSqliteChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);

  let db: SQLite.SQLiteDatabase;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    results.push(ok('sqlite.open', 'Membuka database file', DB_NAME));
  } catch (error) {
    results.push(fail('sqlite.open', errorMessage(error)));
    return results;
  }

  try {
    const row = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v');
    results.push(info('sqlite.version', `SQLite ${row?.v ?? 'unknown'}`));
  } catch (error) {
    results.push(fail('sqlite.version', errorMessage(error)));
  }

  try {
    const options = await db.getAllAsync<{ compile_options: string }>('PRAGMA compile_options');
    const list = options.map((option) => option.compile_options);
    const hasFts5 = list.some((option) => option.includes('ENABLE_FTS5'));
    results.push(
      hasFts5
        ? ok('sqlite.compile_options.fts5', 'ENABLE_FTS5 ada di compile_options', true)
        : info(
            'sqlite.compile_options.fts5',
            'ENABLE_FTS5 tidak dilaporkan; hasil sebenarnya ditentukan oleh uji CREATE VIRTUAL TABLE',
          ),
    );
  } catch (error) {
    results.push(fail('sqlite.compile_options', errorMessage(error)));
  }

  try {
    await db.execAsync('PRAGMA foreign_keys = ON;');
    const row = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    results.push(
      row?.foreign_keys === 1
        ? ok('sqlite.foreign_keys.on', 'PRAGMA foreign_keys = 1')
        : fail('sqlite.foreign_keys.on', `PRAGMA foreign_keys = ${row?.foreign_keys}`),
    );
  } catch (error) {
    results.push(fail('sqlite.foreign_keys.on', errorMessage(error)));
  }

  try {
    await db.execAsync(`
      DROP TABLE IF EXISTS child;
      DROP TABLE IF EXISTS parent;
      CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
        tag TEXT
      );
      CREATE INDEX idx_child_tag ON child(tag);
      INSERT INTO parent (id, name) VALUES (1, 'p');
    `);
    results.push(ok('sqlite.schema', 'Membuat tabel + foreign key + index'));
  } catch (error) {
    results.push(fail('sqlite.schema', errorMessage(error)));
  }

  try {
    let rejected = false;
    try {
      await db.runAsync('INSERT INTO child (id, parent_id, tag) VALUES (99, 12345, ?)', ['orphan']);
    } catch {
      rejected = true;
    }
    results.push(
      rejected
        ? ok('sqlite.foreign_keys.enforced', 'INSERT tanpa parent ditolak', true)
        : fail('sqlite.foreign_keys.enforced', 'INSERT tanpa parent diterima'),
    );
  } catch (error) {
    results.push(fail('sqlite.foreign_keys.enforced', errorMessage(error)));
  }

  try {
    let threw = false;
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO child (id, parent_id, tag) VALUES (?, ?, ?)', [
          2,
          1,
          'rollback',
        ]);
        throw new Error('intentional rollback');
      });
    } catch {
      threw = true;
    }
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM child');
    results.push(
      threw && row?.c === 0
        ? ok('sqlite.transaction.rollback', 'Transaksi rollback; jumlah baris = 0')
        : fail('sqlite.transaction.rollback', `threw=${threw} count=${row?.c}`),
    );
  } catch (error) {
    results.push(fail('sqlite.transaction.rollback', errorMessage(error)));
  }

  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO child (id, parent_id, tag) VALUES (?, ?, ?)', [
        3,
        1,
        'committed',
      ]);
    });
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM child');
    results.push(
      row?.c === 1
        ? ok('sqlite.transaction.commit', 'Transaksi commit; jumlah baris = 1')
        : fail('sqlite.transaction.commit', `count=${row?.c}`),
    );
  } catch (error) {
    results.push(fail('sqlite.transaction.commit', errorMessage(error)));
  }

  try {
    const plan = await db.getAllAsync<Record<string, string>>(
      'EXPLAIN QUERY PLAN SELECT * FROM child WHERE tag = ?',
      ['committed'],
    );
    const text = JSON.stringify(plan);
    results.push(
      /idx_child_tag/i.test(text)
        ? ok('sqlite.index.used', 'Query plan memakai idx_child_tag')
        : fail('sqlite.index.used', text),
    );
  } catch (error) {
    results.push(fail('sqlite.index.used', errorMessage(error)));
  }

  results.push(...(await runFts5Checks(db)));

  try {
    await db.closeAsync();
  } catch {
    // ignore
  }
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);

  return results;
}
