import { useState } from 'react';
import { Image, Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { useVoicePlayer } from '@/core/platform';
import type { AttachmentView } from '@/features/attachments';
import { formatClock } from '@/ui/format/duration';
import { t } from '@/ui/i18n';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type AttachmentSectionProps = {
  views: AttachmentView[];
  busy: boolean;
  onAddGallery: () => void;
  onAddCamera: () => void;
  onRecord: () => void;
  onDelete: (view: AttachmentView) => void;
};

/**
 * Renders a note's attachments (docs/FEATURES.md §8). Images preview inline, audio uses one
 * controlled player, and a missing file degrades to a plain unavailable row.
 */
export function AttachmentSection({
  views,
  busy,
  onAddGallery,
  onAddCamera,
  onRecord,
  onDelete,
}: AttachmentSectionProps) {
  const colors = getTheme(useColorScheme());
  const player = useVoicePlayer();
  const [unavailable, setUnavailable] = useState<Record<string, boolean>>({});

  const markUnavailable = (id: string) =>
    setUnavailable((current) => (current[id] ? current : { ...current, [id]: true }));

  const isMissing = (view: AttachmentView) => !view.available || unavailable[view.attachment.id];

  const addButton = (label: string, onPress: () => void, accessibilityLabel: string) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={busy}
      onPress={onPress}
      style={[styles.addButton, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
    >
      <ThemedText style={[styles.addLabel, { color: colors.accent }]}>{label}</ThemedText>
    </Pressable>
  );

  return (
    <View style={[styles.section, { borderTopColor: colors.border }]}>
      <ThemedText style={[styles.title, { color: colors.textMuted }]}>
        {t('attachments.title')}
      </ThemedText>

      <View style={styles.addRow}>
        {addButton(t('attachments.addGallery'), onAddGallery, t('attachments.addGallery'))}
        {addButton(t('attachments.addCamera'), onAddCamera, t('attachments.addCamera'))}
        {addButton(t('attachments.addVoice'), onRecord, t('attachments.addVoice'))}
      </View>

      {views.length === 0 ? (
        <ThemedText style={[styles.message, { color: colors.textMuted }]}>
          {t('attachments.empty')}
        </ThemedText>
      ) : (
        views.map((view) => {
          const { attachment } = view;
          const missing = isMissing(view);

          if (missing) {
            return (
              <View
                key={attachment.id}
                style={[
                  styles.row,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <ThemedText style={[styles.unavailable, { color: colors.textMuted }]}>
                  {t('attachments.unavailable')}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('attachments.delete')}
                  disabled={busy}
                  onPress={() => onDelete(view)}
                >
                  <ThemedText style={[styles.delete, { color: colors.danger }]}>
                    {t('attachments.delete')}
                  </ThemedText>
                </Pressable>
              </View>
            );
          }

          if (attachment.kind === 'image') {
            const ratio =
              attachment.width && attachment.height && attachment.height > 0
                ? attachment.width / attachment.height
                : 4 / 3;
            return (
              <View key={attachment.id} style={styles.imageBlock}>
                <Image
                  source={{ uri: view.uri }}
                  accessibilityLabel={t('attachments.imageLabel')}
                  resizeMode="cover"
                  onError={() => markUnavailable(attachment.id)}
                  style={[styles.image, { aspectRatio: ratio, backgroundColor: colors.surface }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('attachments.delete')}
                  disabled={busy}
                  onPress={() => onDelete(view)}
                  style={styles.imageDelete}
                >
                  <ThemedText style={[styles.delete, { color: colors.danger }]}>
                    {t('attachments.delete')}
                  </ThemedText>
                </Pressable>
              </View>
            );
          }

          if (attachment.kind === 'audio') {
            const active = player.activeId === attachment.id;
            const playing = active && player.isPlaying;
            const position = active ? player.positionMs : 0;
            const duration =
              active && player.durationMs > 0 ? player.durationMs : (attachment.durationMs ?? 0);
            return (
              <View
                key={attachment.id}
                style={[
                  styles.row,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={playing ? t('attachments.pause') : t('attachments.play')}
                  onPress={() => player.toggle(attachment.id, view.uri)}
                  style={[styles.playButton, { backgroundColor: colors.accentMuted }]}
                >
                  <ThemedText style={[styles.playLabel, { color: colors.accent }]}>
                    {playing ? t('attachments.pause') : t('attachments.play')}
                  </ThemedText>
                </Pressable>
                <ThemedText style={[styles.progress, { color: colors.textMuted }]}>
                  {`${formatClock(position)} / ${formatClock(duration)}`}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('attachments.delete')}
                  disabled={busy}
                  onPress={() => onDelete(view)}
                  style={styles.rowDelete}
                >
                  <ThemedText style={[styles.delete, { color: colors.danger }]}>
                    {t('attachments.delete')}
                  </ThemedText>
                </Pressable>
              </View>
            );
          }

          return (
            <View
              key={attachment.id}
              style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <ThemedText style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                {attachment.originalName ?? attachment.relativePath}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('attachments.delete')}
                disabled={busy}
                onPress={() => onDelete(view)}
              >
                <ThemedText style={[styles.delete, { color: colors.danger }]}>
                  {t('attachments.delete')}
                </ThemedText>
              </Pressable>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  title: { ...type.label },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  addButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addLabel: { ...type.subhead },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  imageBlock: { gap: spacing.xs },
  image: { width: '100%', borderRadius: radius.md },
  imageDelete: { alignSelf: 'flex-end' },
  playButton: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  playLabel: { ...type.subhead },
  progress: { flex: 1, ...type.label },
  rowDelete: { marginLeft: 'auto' },
  fileName: { flex: 1, ...type.subhead },
  delete: { ...type.subhead },
  unavailable: { flex: 1, ...type.subhead },
  message: { ...type.subhead },
});
