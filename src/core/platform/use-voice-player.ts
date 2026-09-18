import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useState } from 'react';

import { playbackIntent } from './voice-player-state';

export type VoicePlayer = {
  /** Attachment id currently loaded in the shared player, if any. */
  activeId: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  toggle: (id: string, uri: string) => void;
  stop: () => void;
};

/**
 * One controlled audio player for a screen (docs/FEATURES.md §8). `expo-audio`
 * auto-releases the native player when the component unmounts, so leaving the note
 * releases playback resources.
 */
export function useVoicePlayer(): VoicePlayer {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [activeId, setActiveId] = useState<string | null>(null);

  const toggle = useCallback(
    (id: string, uri: string) => {
      const intent = playbackIntent(activeId, status.playing, id);
      if (intent.action === 'pause') {
        player.pause();
        setActiveId(null);
        return;
      }
      player.replace({ uri });
      player.play();
      setActiveId(intent.id);
    },
    [activeId, player, status.playing],
  );

  const stop = useCallback(() => {
    player.pause();
    setActiveId(null);
  }, [player]);

  return {
    activeId,
    isPlaying: status.playing,
    positionMs: Math.round((status.currentTime ?? 0) * 1000),
    durationMs: Math.round((status.duration ?? 0) * 1000),
    toggle,
    stop,
  };
}
