/**
 * Pure reconciliation classification (docs/DATABASE.md §7.3). The sweep never deletes
 * unreferenced user files: only queued paths are deleted; orphans are only reported.
 */

import { ATTACHMENTS_DIRECTORY, buildRelativePath } from './attachment-files';

export type VaultClassification = {
  matched: string[];
  /** DB rows whose file is absent. */
  missing: string[];
  /** Files with no DB row and no pending deletion. */
  orphan: string[];
};

/**
 * @param dbPaths vault-relative paths stored in `attachments`.
 * @param fileNames names directly under `attachments/`.
 * @param pendingPaths vault-relative paths already queued for deletion.
 */
export function classifyVaultFiles(
  dbPaths: string[],
  fileNames: string[],
  pendingPaths: string[],
): VaultClassification {
  const dbSet = new Set(dbPaths);
  const pendingSet = new Set(pendingPaths);
  const fileSet = new Set(fileNames.map((name) => buildRelativePath(name)));

  const matched: string[] = [];
  const missing: string[] = [];
  const orphan: string[] = [];

  for (const path of dbSet) {
    if (fileSet.has(path)) matched.push(path);
    else missing.push(path);
  }
  for (const path of fileSet) {
    if (!dbSet.has(path) && !pendingSet.has(path)) orphan.push(path);
  }

  matched.sort();
  missing.sort();
  orphan.sort();
  return { matched, missing, orphan };
}

export const ATTACHMENTS_RELATIVE_DIR = ATTACHMENTS_DIRECTORY;
