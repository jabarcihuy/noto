/**
 * URL metadata capability (docs/ARCHITECTURE.md §8, §10; PRD §9.4). Best-effort and
 * optional: implementations must never be required for a note to exist.
 */

export type UrlMetadata = {
  /** Canonical URL after redirects, when known. */
  finalUrl: string;
  title: string | null;
  description: string | null;
  domain: string | null;
  /** Absolute image URL when the page declares one; never fetched here. */
  imageUrl: string | null;
};

export type UrlMetadataResult =
  { status: 'ok'; metadata: UrlMetadata } | { status: 'unavailable' } | { status: 'invalid-url' };

export interface UrlMetadataPort {
  /** Fetches and parses page metadata with a bounded timeout. Never throws. */
  fetchMetadata(url: string): Promise<UrlMetadataResult>;
}
