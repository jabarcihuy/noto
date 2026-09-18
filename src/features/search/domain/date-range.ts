/**
 * Date filter presets (docs/FEATURES.md §7.2).
 *
 * **Provisional Implementation Decision:** the filter compares `notes.updated_at` with
 * inclusive boundaries (`>= dateFrom` and `<= dateTo`). The product question "created vs
 * updated, and inclusive boundaries" is still open (`ROADMAP.md` → Open Product
 * Questions); this file deliberately keeps the choice in one place so it can change
 * without touching the query layer. No date-picker dependency was added; the UI offers
 * relative presets only.
 */

export type DatePreset = 'all' | 'today' | 'week' | 'month';

export type DateRange = { dateFrom: string; dateTo: string };

export function isDatePreset(value: string): value is DatePreset {
  return value === 'all' || value === 'today' || value === 'week' || value === 'month';
}

/** Resolves a local-time preset into inclusive ISO boundaries, or null for `all`. */
export function resolveDatePreset(preset: DatePreset, now: Date = new Date()): DateRange | null {
  if (preset === 'all') return null;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === 'week') start.setDate(start.getDate() - 6);
  if (preset === 'month') start.setDate(start.getDate() - 29);

  return { dateFrom: start.toISOString(), dateTo: now.toISOString() };
}
