export type CheckStatus = 'ok' | 'fail' | 'info';

export type CheckResult = {
  /** Stable identifier for the check. */
  name: string;
  status: CheckStatus;
  /** Human-readable detail; for `info` this is the finding. */
  detail: string;
  /** Optional measured value. */
  value?: string | number | boolean;
};

export const ok = (name: string, detail = '', value?: CheckResult['value']): CheckResult => ({
  name,
  status: 'ok',
  detail,
  value,
});

export const fail = (name: string, detail: string): CheckResult => ({
  name,
  status: 'fail',
  detail,
});

export const info = (name: string, detail: string, value?: CheckResult['value']): CheckResult => ({
  name,
  status: 'info',
  detail,
  value,
});

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
