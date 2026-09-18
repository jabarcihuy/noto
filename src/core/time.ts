/**
 * Time source for persisted timestamps (docs/DATABASE.md §2).
 * ISO-8601 UTC so lexical ordering equals chronological ordering.
 */
export type Clock = () => string;

export function nowIso(): string {
  return new Date().toISOString();
}
