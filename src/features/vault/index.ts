export {
  serializeNoteMarkdown,
  sanitizeNoteFilename,
  buildExportFilename,
  resolveUniqueFilename,
  countAttachmentReferences,
} from './domain/note-markdown';
export type { NoteMarkdownOptions } from './domain/note-markdown';
export {
  ATTACHMENTS_DIRECTORY as VAULT_ATTACHMENTS_DIRECTORY,
  MANIFEST_FILENAME,
  NOTES_DIRECTORY,
  VAULT_FORMAT,
  VAULT_FORMAT_VERSION,
  extractAttachmentPaths,
  parseManifest,
  planVaultExport,
  serializeManifest,
} from './domain/vault-format';
export type {
  ManifestAttachment,
  ManifestNote,
  ManifestNoteLink,
  ManifestNotebook,
  ManifestSavedSearch,
  ManifestTag,
  ManifestTemplate,
  VaultAttachmentFile,
  VaultExportInput,
  VaultExportPlan,
  VaultManifest,
  VaultNoteFile,
} from './domain/vault-format';
export {
  ensureFrontmatterTagsInContent,
  extractAttachmentCandidates,
  filenameTitle,
  isSupportedAttachmentName,
  parseImportFile,
  rewriteAttachmentReferences,
  splitFrontmatter,
} from './domain/markdown-import';
export type {
  AttachmentCandidate,
  FrontmatterValue,
  ParsedImportFile,
} from './domain/markdown-import';
export { createExportNote } from './application/export-note';
export type { ExportNote, ExportNoteOptions, ExportNoteResult } from './application/export-note';
export { createVaultExporter } from './application/export-vault';
export type {
  StageReporter,
  VaultExportResult,
  VaultExporter,
  VaultStage,
} from './application/export-vault';
export { createVaultImporter } from './application/import-vault';
export type {
  VaultImportResult,
  VaultImportSource,
  VaultImporter,
} from './application/import-vault';
export { createVaultUseCases } from './application/vault-use-cases';
export type { VaultUseCases } from './application/vault-use-cases';
