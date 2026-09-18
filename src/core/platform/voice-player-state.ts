/** Pure playback intent used by the voice player hook (testable without React). */

export type PlaybackIntent = { action: 'play'; id: string } | { action: 'pause' };

/**
 * Toggle semantics for a single shared player: tapping the currently playing attachment
 * pauses it; tapping any other attachment plays that one, so at most one attachment
 * plays at a time.
 */
export function playbackIntent(
  currentId: string | null,
  isPlaying: boolean,
  requestedId: string,
): PlaybackIntent {
  if (currentId === requestedId && isPlaying) return { action: 'pause' };
  return { action: 'play', id: requestedId };
}
