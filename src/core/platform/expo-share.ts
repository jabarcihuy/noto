import * as Sharing from 'expo-sharing';

import type { SharePort } from './share-port';

/** `expo-sharing` implementation of the outbound share port. */
export function createExpoShare(): SharePort {
  return {
    isAvailable: () => Sharing.isAvailableAsync(),
    async shareFile(uri, options) {
      await Sharing.shareAsync(uri, {
        mimeType: options.mimeType,
        dialogTitle: options.dialogTitle,
      });
    },
  };
}
