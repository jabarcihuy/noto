import * as Crypto from 'expo-crypto';

import { type CheckResult, errorMessage, fail, ok } from '../types';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Runtime feasibility check for stable ID generation (docs/DATABASE.md §2).
 */
export function runCryptoChecks(): CheckResult[] {
  try {
    const sample = Crypto.randomUUID();
    if (!UUID_V4.test(sample)) {
      return [fail('crypto.uuid.format', `Format UUID tidak sesuai: ${sample}`)];
    }

    const count = 2000;
    const seen = new Set<string>();
    for (let index = 0; index < count; index += 1) {
      seen.add(Crypto.randomUUID());
    }

    return [
      ok('crypto.uuid.format', `randomUUID() menghasilkan UUID v4: ${sample}`),
      seen.size === count
        ? ok('crypto.uuid.unique', `${count} UUID unik dari ${count} pembangkitan`, seen.size)
        : fail('crypto.uuid.unique', `Hanya ${seen.size} unik dari ${count}`),
    ];
  } catch (error) {
    return [fail('crypto.uuid', errorMessage(error))];
  }
}
