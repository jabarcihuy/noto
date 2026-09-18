import type { AppFileSystemPort } from '@/core/fs/filesystem-port';

export type FakeExternalFile = { relativePath: string; uri: string };

export type FakeFileSystem = {
  port: AppFileSystemPort;
  /** Vault-relative path -> contents. */
  files: Map<string, string>;
  /** External source URI -> contents (image picker / recorder / import source). */
  sources: Map<string, string>;
  /** Export destination: `${directoryUri}/${relativePath}` -> contents. */
  exported: Map<string, string>;
  putSource(uri: string, contents: string): void;
  putVaultFile(relativePath: string, contents: string): void;
  putExternalDirectory(directoryUri: string, files: FakeExternalFile[]): void;
  setPickedFile(file: { name: string; uri: string } | null): void;
  setPickedDirectory(uri: string | null): void;
  exportedHas(directoryUri: string, relativePath: string): boolean;
  setCopyFailure(value: boolean): void;
  setDeleteFailure(value: boolean): void;
  setDownloadFailure(value: boolean): void;
  putDownload(url: string, contents: string, mimeType?: string | null): void;
};

/**
 * In-memory `AppFileSystemPort` for application-layer tests. It lets tests simulate copy
 * failure, delete failure, picked files/directories, and export destinations without
 * touching a device filesystem.
 */
export function createFakeFileSystem(): FakeFileSystem {
  const files = new Map<string, string>();
  const sources = new Map<string, string>();
  const exported = new Map<string, string>();
  const externalDirectories = new Map<string, FakeExternalFile[]>();
  const downloads = new Map<string, { contents: string; mimeType: string | null }>();
  let pickedFile: { name: string; uri: string } | null = null;
  let pickedDirectory: string | null = null;
  let copyFailure = false;
  let deleteFailure = false;
  let downloadFailure = false;

  const key = (directoryUri: string, relativePath: string) => `${directoryUri}/${relativePath}`;

  const port: AppFileSystemPort = {
    async createExportDirectory(name: string): Promise<string> {
      return `fake://exports/${name}`;
    },
    async writeTextFile(directoryUri: string, filename: string, contents: string): Promise<string> {
      const uri = `${directoryUri}/${filename}`;
      files.set(uri, contents);
      return uri;
    },
    async removeDirectory(): Promise<void> {
      // no-op
    },
    async copyIntoVault(
      sourceUri: string,
      relativePath: string,
    ): Promise<{ byteSize: number | null }> {
      if (copyFailure) throw new Error('fake copy failure');
      const data = sources.get(sourceUri);
      if (data === undefined) throw new Error('fake source missing');
      files.set(relativePath, data);
      return { byteSize: data.length };
    },
    async deleteVaultFile(relativePath: string): Promise<void> {
      if (deleteFailure) throw new Error('fake delete failure');
      files.delete(relativePath);
    },
    async downloadIntoVault(
      url: string,
      relativePath: string,
    ): Promise<{ byteSize: number | null; mimeType: string | null }> {
      if (downloadFailure) throw new Error('fake download failure');
      const data = downloads.get(url);
      if (data === undefined) throw new Error('fake download missing');
      files.set(relativePath, data.contents);
      return { byteSize: data.contents.length, mimeType: data.mimeType };
    },
    async deleteUri(uri: string): Promise<void> {
      sources.delete(uri);
      files.delete(uri);
    },
    async vaultFileExists(relativePath: string): Promise<boolean> {
      return files.has(relativePath);
    },
    async vaultFileSize(relativePath: string): Promise<number | null> {
      const data = files.get(relativePath);
      return data === undefined ? null : data.length;
    },
    async listVaultDirectory(relativeDir: string): Promise<string[]> {
      const prefix = `${relativeDir}/`;
      return [...files.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .filter((name) => !name.includes('/'));
    },
    vaultUri(relativePath: string): string {
      return `fake://vault/${relativePath}`;
    },

    async pickMarkdownFile(): Promise<{ name: string; uri: string } | null> {
      return pickedFile;
    },
    async pickDirectory(): Promise<string | null> {
      return pickedDirectory;
    },
    async listFilesRecursive(directoryUri: string): Promise<FakeExternalFile[]> {
      return externalDirectories.get(directoryUri) ?? [];
    },
    async readTextFile(uri: string): Promise<string> {
      const data = sources.get(uri);
      if (data === undefined) throw new Error('fake source missing');
      return data;
    },
    async createFallbackExportDirectory(name: string): Promise<string> {
      return `fake://cache/vault-export/${name}`;
    },
    async writeFileAt(
      directoryUri: string,
      relativePath: string,
      contents: string,
    ): Promise<string> {
      exported.set(key(directoryUri, relativePath), contents);
      return `${directoryUri}/${relativePath}`;
    },
    async copyFileAt(directoryUri: string, relativePath: string, sourceUri: string): Promise<void> {
      const data = sources.get(sourceUri) ?? files.get(sourceUri);
      if (data === undefined) throw new Error('fake source missing');
      exported.set(key(directoryUri, relativePath), data);
    },
    async copyVaultFileAt(
      directoryUri: string,
      relativePath: string,
      vaultRelativePath: string,
    ): Promise<void> {
      const data = files.get(vaultRelativePath);
      if (data === undefined) throw new Error('fake vault source missing');
      exported.set(key(directoryUri, relativePath), data);
    },
    async fileExistsAt(directoryUri: string, relativePath: string): Promise<boolean> {
      return exported.has(key(directoryUri, relativePath));
    },
  };

  return {
    port,
    files,
    sources,
    exported,
    putSource: (uri, contents) => sources.set(uri, contents),
    putVaultFile: (relativePath, contents) => files.set(relativePath, contents),
    putExternalDirectory: (directoryUri, list) => externalDirectories.set(directoryUri, list),
    setPickedFile: (file) => {
      pickedFile = file;
    },
    setPickedDirectory: (uri) => {
      pickedDirectory = uri;
    },
    exportedHas: (directoryUri, relativePath) => exported.has(key(directoryUri, relativePath)),
    setCopyFailure: (value) => {
      copyFailure = value;
    },
    setDeleteFailure: (value) => {
      deleteFailure = value;
    },
    setDownloadFailure: (value) => {
      downloadFailure = value;
    },
    putDownload: (url, contents, mimeType = 'image/png') =>
      downloads.set(url, { contents, mimeType }),
  };
}
