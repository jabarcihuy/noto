import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import { type CheckResult, errorMessage, fail, info, ok } from '../types';

/**
 * Feasibility checks for file import/export, sharing, and share receiving
 * (docs/ROADMAP.md Phase 0, docs/DATABASE.md §9, PRD §9.5, §12).
 */
export async function runExportImportChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  try {
    const available = await Sharing.isAvailableAsync();
    results.push(
      available
        ? ok('export.sharing.available', 'expo-sharing tersedia untuk berbagi file')
        : fail('export.sharing.available', 'expo-sharing tidak tersedia'),
    );
  } catch (error) {
    results.push(fail('export.sharing.available', errorMessage(error)));
  }

  results.push(
    typeof DocumentPicker.getDocumentAsync === 'function'
      ? ok('import.document_picker', 'DocumentPicker.getDocumentAsync tersedia (file tunggal)')
      : fail('import.document_picker', 'getDocumentAsync tidak tersedia'),
  );

  // Share receiving (first-party in expo-sharing SDK 57).
  const shareReceiveApis: [string, unknown][] = [
    ['share.receive.payloads', (Sharing as Record<string, unknown>).getSharedPayloads],
    ['share.receive.resolved', (Sharing as Record<string, unknown>).getResolvedSharedPayloadsAsync],
    ['share.receive.clear', (Sharing as Record<string, unknown>).clearSharedPayloads],
  ];
  for (const [name, api] of shareReceiveApis) {
    results.push(
      typeof api === 'function'
        ? ok(name, 'API penerimaan share first-party tersedia')
        : fail(name, 'API tidak tersedia'),
    );
  }

  results.push(
    info(
      'export.zip',
      'Tidak ada API ZIP/arsip first-party di expo-file-system/expo-sharing; perlu keputusan dependensi (mis. JSZip) atau ekspor folder.',
    ),
  );

  results.push(
    info(
      'export.folder_vs_file',
      'Directory.pickDirectoryAsync (SAF) dan File.pickFileAsync tersedia; pengerjaan folder harus diuji di perangkat, bukan diasumsikan.',
    ),
  );

  return results;
}
