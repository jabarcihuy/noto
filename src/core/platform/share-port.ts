/**
 * Outbound sharing capability (docs/ARCHITECTURE.md §8). `expo-sharing` backs it; the
 * application layer depends on this interface only.
 */
export interface SharePort {
  isAvailable(): Promise<boolean>;
  shareFile(uri: string, options: { mimeType: string; dialogTitle?: string }): Promise<void>;
}
