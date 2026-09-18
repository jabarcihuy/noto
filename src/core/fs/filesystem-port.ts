/**
 * Filesystem port (docs/ARCHITECTURE.md §6). Implementations may import
 * `expo-file-system`; domain/application code must not.
 */

export interface FileSystemPort {
  /** Creates (idempotently) a dedicated export directory and returns its URI. */
  createExportDirectory(name: string): Promise<string>;
  /** Writes UTF-8 text and returns the resulting file URI. */
  writeTextFile(directoryUri: string, filename: string, contents: string): Promise<string>;
  /** Best-effort directory removal. */
  removeDirectory(directoryUri: string): Promise<void>;
}

/**
 * Vault-relative binary storage used by attachments (docs/DATABASE.md §7.1). Paths are
 * always vault-relative (`attachments/<file>`); the adapter owns the vault root so no
 * absolute path ever reaches the database or the UI.
 */
export interface VaultFileSystemPort {
  /** Copies an external source URI into the vault, creating parents; verifies the copy. */
  copyIntoVault(sourceUri: string, relativePath: string): Promise<{ byteSize: number | null }>;
  /**
   * Downloads an http(s) URL directly into the vault (URL preview images, PRD §9.4).
   * Implementations must enforce a timeout and never leave a partial file behind.
   */
  downloadIntoVault(
    url: string,
    relativePath: string,
  ): Promise<{ byteSize: number | null; mimeType: string | null }>;
  /** Deletes a vault file; a missing file is treated as already deleted. */
  deleteVaultFile(relativePath: string): Promise<void>;
  /** Best-effort deletion of an arbitrary URI (used for discarded recordings). */
  deleteUri(uri: string): Promise<void>;
  vaultFileExists(relativePath: string): Promise<boolean>;
  vaultFileSize(relativePath: string): Promise<number | null>;
  /** File names (not paths) directly under a vault-relative directory. */
  listVaultDirectory(relativeDir: string): Promise<string[]>;
  /** Absolute URI for display/playback; never persisted. */
  vaultUri(relativePath: string): string;
}

/** The full application filesystem capability (export + vault + transfer). */
export type AppFileSystemPort = FileSystemPort & VaultFileSystemPort & TransferFileSystemPort;

/**
 * Transfer capability used by vault export/import (docs/DATABASE.md §9). A picked
 * directory is a platform URI (Android SAF); this port hides whether it is a content://
 * tree or a plain directory.
 */
export interface TransferFileSystemPort {
  /** Picks a single Markdown file; null when the user cancels. */
  pickMarkdownFile(): Promise<{ name: string; uri: string } | null>;
  /** Picks an import/export directory; null when unavailable or cancelled. */
  pickDirectory(): Promise<string | null>;
  /** Files below a picked directory, with paths relative to it. */
  listFilesRecursive(directoryUri: string): Promise<{ relativePath: string; uri: string }[]>;
  readTextFile(uri: string): Promise<string>;
  /** App-private fallback when directory picking is unavailable. */
  createFallbackExportDirectory(name: string): Promise<string>;
  /** Writes UTF-8 text at `directoryUri/relativePath`, creating parent directories. */
  writeFileAt(directoryUri: string, relativePath: string, contents: string): Promise<string>;
  /** Copies an arbitrary source URI to `directoryUri/relativePath`. */
  copyFileAt(directoryUri: string, relativePath: string, sourceUri: string): Promise<void>;
  /** Copies a vault-relative file to `directoryUri/relativePath`. */
  copyVaultFileAt(
    directoryUri: string,
    relativePath: string,
    vaultRelativePath: string,
  ): Promise<void>;
  fileExistsAt(directoryUri: string, relativePath: string): Promise<boolean>;
}
