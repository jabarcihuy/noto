import { runSqliteChecks } from './db/sqlite-checks';
import { runFilesystemChecks } from './fs/fs-checks';
import { runMarkdownChecks } from './markdown/markdown-checks';
import { runCryptoChecks } from './platform/crypto-checks';
import { runExportImportChecks } from './platform/export-checks';
import { runMediaChecks } from './platform/media-checks';
import { type CheckResult, errorMessage, fail } from './types';

export type { CheckResult, CheckStatus } from './types';

/** Runs every Phase 0 feasibility check and returns the collected results. */
export async function runAllPhase0Checks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(...runCryptoChecks());
  results.push(...runMarkdownChecks());
  results.push(...(await runFilesystemChecks()));

  try {
    results.push(...(await runSqliteChecks()));
  } catch (error) {
    results.push(fail('sqlite.checks', errorMessage(error)));
  }

  results.push(...(await runMediaChecks()));
  results.push(...(await runExportImportChecks()));

  return results;
}
