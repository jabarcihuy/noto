import type { AppFileSystemPort } from '@/core/fs/filesystem-port';

import type { StageReporter, VaultExportResult } from './export-vault';
import type { VaultImportResult } from './import-vault';

export type VaultUseCases = ReturnType<typeof createVaultUseCases>;

/**
 * UI-facing vault operations (docs/FEATURES.md §9.2–9.4). The UI never touches the
 * filesystem or repositories directly; it triggers an operation and receives a report.
 */
export function createVaultUseCases(deps: {
  fileSystem: AppFileSystemPort;
  exportVault: (options?: { onStage?: StageReporter }) => Promise<VaultExportResult>;
  importVault: (
    source: { kind: 'file'; name: string; uri: string } | { kind: 'directory'; uri: string },
    options?: { onStage?: StageReporter },
  ) => Promise<VaultImportResult>;
}) {
  return {
    exportVault(options?: { onStage?: StageReporter }): Promise<VaultExportResult> {
      return deps.exportVault(options);
    },

    /** Imports an already-known source (tests and programmatic callers). */
    importVault(
      source: { kind: 'file'; name: string; uri: string } | { kind: 'directory'; uri: string },
      options?: { onStage?: StageReporter },
    ): Promise<VaultImportResult> {
      return deps.importVault(source, options);
    },

    /** Picks one Markdown file and imports it; null when the user cancels. */
    async pickAndImportFile(options?: {
      onStage?: StageReporter;
    }): Promise<VaultImportResult | null> {
      const picked = await deps.fileSystem.pickMarkdownFile();
      if (!picked) return null;
      return deps.importVault({ kind: 'file', name: picked.name, uri: picked.uri }, options);
    },

    /** Picks a folder/vault and imports it; null when picking is unavailable/cancelled. */
    async pickAndImportDirectory(options?: {
      onStage?: StageReporter;
    }): Promise<VaultImportResult | null> {
      const uri = await deps.fileSystem.pickDirectory();
      if (!uri) return null;
      return deps.importVault({ kind: 'directory', uri }, options);
    },
  };
}
