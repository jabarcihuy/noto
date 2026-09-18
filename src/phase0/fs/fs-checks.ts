import { Directory, File, Paths } from 'expo-file-system';

import { type CheckResult, errorMessage, fail, info, ok } from '../types';

/**
 * Runtime feasibility checks for expo-file-system (docs/ARCHITECTURE.md §6,
 * docs/DATABASE.md §7).
 *
 * Verifies app-private storage, directory creation, write/read/delete, existence checks,
 * and binary handling. Does not implement the attachment subsystem.
 */
export async function runFilesystemChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const root = new Directory(Paths.document, 'noto-phase0');

  try {
    root.create({ idempotent: true, intermediates: true });
    results.push(
      root.exists
        ? ok('fs.dir.create', `Direktori app-private dibuat: ${root.uri}`, true)
        : fail('fs.dir.create', 'Direktori tidak ada setelah create'),
    );
  } catch (error) {
    results.push(fail('fs.dir.create', errorMessage(error)));
    return results;
  }

  try {
    const file = new File(root, 'note.md');
    file.create({ overwrite: true });
    const content = '# Halo #uji\n\n[[Catatan Lain]]\n\n![foto](attachments/photo.jpg)';
    file.write(content);
    const read = await file.text();
    const exists = file.exists;
    const size = file.info().size;
    results.push(
      read === content && exists
        ? ok('fs.file.write_read', `Tulis/baca teks cocok (${size ?? 0} byte)`, size ?? 0)
        : fail('fs.file.write_read', `exists=${exists} match=${read === content}`),
    );
  } catch (error) {
    results.push(fail('fs.file.write_read', errorMessage(error)));
  }

  try {
    const attachments = new Directory(root, 'attachments');
    attachments.create({ idempotent: true, intermediates: true });
    const binary = new File(attachments, 'blob.bin');
    binary.create({ overwrite: true });
    binary.write(new Uint8Array([0, 1, 2, 3, 255]));
    const bytes = await binary.bytes();
    results.push(
      bytes.length === 5
        ? ok('fs.binary.write_read', 'Menulis/membaca 5 byte biner', bytes.length)
        : fail('fs.binary.write_read', `panjang=${bytes.length}`),
    );

    const listed = root.list().map((entry) => entry.name);
    results.push(
      listed.includes('note.md') && listed.includes('attachments')
        ? ok('fs.dir.list', `Directory.list(): [${listed.join(', ')}]`)
        : fail('fs.dir.list', `[${listed.join(', ')}]`),
    );
  } catch (error) {
    results.push(fail('fs.binary.write_read', errorMessage(error)));
  }

  try {
    const file = new File(root, 'note.md');
    file.delete();
    results.push(
      !file.exists
        ? ok('fs.file.delete', 'File dihapus; exists=false')
        : fail('fs.file.delete', 'File masih ada'),
    );
  } catch (error) {
    results.push(fail('fs.file.delete', errorMessage(error)));
  }

  try {
    root.delete();
    results.push(info('fs.dir.cleanup', 'Direktori uji dibersihkan'));
  } catch (error) {
    results.push(fail('fs.dir.cleanup', errorMessage(error)));
  }

  try {
    const free = Paths.availableDiskSpace;
    results.push(info('fs.disk.available', `Ruang tersedia ~${Math.round(free / 1024 / 1024)} MB`));
  } catch (error) {
    results.push(fail('fs.disk.available', errorMessage(error)));
  }

  const pickers: CheckResult[] = [
    typeof File.pickFileAsync === 'function'
      ? ok('fs.picker.file', 'File.pickFileAsync tersedia')
      : fail('fs.picker.file', 'File.pickFileAsync tidak tersedia'),
    typeof Directory.pickDirectoryAsync === 'function'
      ? ok('fs.picker.directory', 'Directory.pickDirectoryAsync tersedia (SAF)')
      : fail('fs.picker.directory', 'Directory.pickDirectoryAsync tidak tersedia'),
  ];
  results.push(...pickers);

  return results;
}
