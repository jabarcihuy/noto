import { Directory, File, Paths } from 'expo-file-system';

import type { AppFileSystemPort } from './filesystem-port';

const VAULT_DIRECTORY = 'vault';

function vaultRoot(): Directory {
  return new Directory(Paths.document, VAULT_DIRECTORY);
}

/**
 * `expo-file-system` implementation of the filesystem port. This is the only production
 * file allowed to import `expo-file-system` for vault/export IO
 * (docs/ARCHITECTURE.md §6).
 */
export function createExpoFileSystem(): AppFileSystemPort {
  return {
    async createExportDirectory(name: string): Promise<string> {
      const directory = new Directory(Paths.cache, 'exports', name);
      directory.create({ idempotent: true, intermediates: true });
      return directory.uri;
    },

    async writeTextFile(directoryUri: string, filename: string, contents: string): Promise<string> {
      const directory = new Directory(directoryUri);
      const file = new File(directory, filename);
      file.create({ overwrite: true });
      file.write(contents);
      return file.uri;
    },

    async removeDirectory(directoryUri: string): Promise<void> {
      try {
        new Directory(directoryUri).delete();
      } catch {
        // Best effort: a leftover temp export directory is harmless.
      }
    },

    async copyIntoVault(
      sourceUri: string,
      relativePath: string,
    ): Promise<{ byteSize: number | null }> {
      const destination = new File(vaultRoot(), relativePath);
      destination.parentDirectory.create({ idempotent: true, intermediates: true });

      const source = new File(sourceUri);
      await source.copy(destination, { overwrite: true });

      if (!destination.exists) {
        throw new Error(`Vault copy did not produce a file at ${relativePath}`);
      }
      return { byteSize: destination.info().size ?? null };
    },

    async deleteVaultFile(relativePath: string): Promise<void> {
      const file = new File(vaultRoot(), relativePath);
      if (!file.exists) return;
      file.delete();
    },

    async downloadIntoVault(
      url: string,
      relativePath: string,
    ): Promise<{ byteSize: number | null; mimeType: string | null }> {
      const destination = new File(vaultRoot(), relativePath);
      destination.parentDirectory.create({ idempotent: true, intermediates: true });
      try {
        const downloaded = await File.downloadFileAsync(url, destination, { idempotent: true });
        if (!downloaded.exists) throw new Error('download did not produce a file');
        return {
          byteSize: downloaded.info().size ?? null,
          mimeType: downloaded.type ?? null,
        };
      } catch (error) {
        // Never leave a partial preview behind.
        try {
          if (destination.exists) destination.delete();
        } catch {
          // Best effort; the reconciliation sweep reports leftovers.
        }
        throw error;
      }
    },

    async deleteUri(uri: string): Promise<void> {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Best effort: temporary recordings live in cache and are cleaned by the OS.
      }
    },

    async vaultFileExists(relativePath: string): Promise<boolean> {
      try {
        return new File(vaultRoot(), relativePath).exists;
      } catch {
        return false;
      }
    },

    async vaultFileSize(relativePath: string): Promise<number | null> {
      try {
        const file = new File(vaultRoot(), relativePath);
        return file.exists ? (file.info().size ?? null) : null;
      } catch {
        return null;
      }
    },

    async listVaultDirectory(relativeDir: string): Promise<string[]> {
      const directory = new Directory(vaultRoot(), relativeDir);
      if (!directory.exists) return [];
      return directory
        .list()
        .filter((entry) => Paths.info(entry.uri).isDirectory !== true)
        .map((entry) => entry.name);
    },

    vaultUri(relativePath: string): string {
      return new File(vaultRoot(), relativePath).uri;
    },

    async pickMarkdownFile(): Promise<{ name: string; uri: string } | null> {
      try {
        const result = await File.pickFileAsync({
          multipleFiles: false,
          mimeTypes: ['text/markdown', 'text/plain', 'application/octet-stream'],
        });
        if (result.canceled || !result.result) return null;
        return { name: result.result.name, uri: result.result.uri };
      } catch {
        return null;
      }
    },

    async pickDirectory(): Promise<string | null> {
      try {
        const directory = await Directory.pickDirectoryAsync();
        return directory.uri;
      } catch {
        return null;
      }
    },

    async listFilesRecursive(
      directoryUri: string,
    ): Promise<{ relativePath: string; uri: string }[]> {
      const results: { relativePath: string; uri: string }[] = [];
      const walk = (directory: Directory, prefix: string, depth: number) => {
        if (depth > 8) return;
        for (const entry of directory.list()) {
          const relativePath = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
          if (Paths.info(entry.uri).isDirectory === true) {
            walk(new Directory(entry.uri), relativePath, depth + 1);
          } else {
            results.push({ relativePath, uri: entry.uri });
          }
        }
      };
      try {
        walk(new Directory(directoryUri), '', 0);
      } catch {
        return [];
      }
      return results;
    },

    async readTextFile(uri: string): Promise<string> {
      return new File(uri).text();
    },

    async createFallbackExportDirectory(name: string): Promise<string> {
      const directory = new Directory(Paths.cache, 'vault-export', name);
      directory.create({ idempotent: true, intermediates: true });
      return directory.uri;
    },

    async writeFileAt(
      directoryUri: string,
      relativePath: string,
      contents: string,
    ): Promise<string> {
      const file = new File(new Directory(directoryUri), relativePath);
      file.parentDirectory.create({ idempotent: true, intermediates: true });
      file.create({ overwrite: true });
      file.write(contents);
      return file.uri;
    },

    async copyFileAt(directoryUri: string, relativePath: string, sourceUri: string): Promise<void> {
      const destination = new File(new Directory(directoryUri), relativePath);
      destination.parentDirectory.create({ idempotent: true, intermediates: true });
      await new File(sourceUri).copy(destination, { overwrite: true });
      if (!destination.exists) {
        throw new Error(`Export copy did not produce a file at ${relativePath}`);
      }
    },

    async copyVaultFileAt(
      directoryUri: string,
      relativePath: string,
      vaultRelativePath: string,
    ): Promise<void> {
      const source = new File(vaultRoot(), vaultRelativePath);
      const destination = new File(new Directory(directoryUri), relativePath);
      destination.parentDirectory.create({ idempotent: true, intermediates: true });
      await source.copy(destination, { overwrite: true });
      if (!destination.exists) {
        throw new Error(`Vault export copy did not produce a file at ${relativePath}`);
      }
    },

    async fileExistsAt(directoryUri: string, relativePath: string): Promise<boolean> {
      try {
        return new File(new Directory(directoryUri), relativePath).exists;
      } catch {
        return false;
      }
    },
  };
}
