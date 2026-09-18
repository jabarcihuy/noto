import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';

import type { AttachmentView } from '@/features/attachments';
import type { Note } from '@/features/notes/domain/note';
import type { NoteLink, Wikilink } from '@/features/links';
import type { Notebook } from '@/features/notebooks/domain/notebook';
import type { Tag } from '@/features/tags/domain/tag';
import { countAttachmentReferences } from '@/features/vault/domain/note-markdown';
import { AttachmentSection } from '@/ui/components/attachment-section';
import { NoteContent } from '@/ui/components/note-content';
import { PrimaryButton } from '@/ui/components/primary-button';
import { toError } from '@/ui/errors';
import { formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type DetailState =
  | { status: 'loading' }
  | {
      status: 'ready';
      note: Note;
      tags: Tag[];
      notebook: Notebook | null;
      links: NoteLink[];
      backlinks: Note[];
      attachments: AttachmentView[];
    }
  | { status: 'notFound' }
  | { status: 'error'; error: Error };

export default function NoteDetailScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = String(id);

  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [exporting, setExporting] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const fetchBundle = useCallback(async () => {
    const note = await services.notes.openNote(noteId);
    if (!note) return null;
    const [tags, notebook, links, backlinks, attachments] = await Promise.all([
      services.tags.listForNote(noteId),
      note.notebookId ? services.notebooks.getById(note.notebookId) : Promise.resolve(null),
      services.links.listBySource(noteId),
      services.links.listBacklinks(noteId),
      services.attachments.listForNote(noteId),
    ]);
    return { note, tags, notebook, links, backlinks, attachments };
  }, [services, noteId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const bundle = await fetchBundle();
          if (!active) return;
          setState(bundle ? { status: 'ready', ...bundle } : { status: 'notFound' });
        } catch (error) {
          if (active) setState({ status: 'error', error: toError(error) });
        }
      })();
      return () => {
        active = false;
      };
    }, [fetchBundle]),
  );

  const performExport = useCallback(
    async (note: Note, tags: Tag[], notebook: Notebook | null) => {
      setExporting(true);
      try {
        const result = await services.exportNote(note, {
          dialogTitle: t('export.dialogTitle'),
          tags: tags.map((tag) => tag.name),
          notebook: notebook?.name ?? null,
        });
        if (!result.shared) {
          Alert.alert(t('export.notSharedTitle'), t('export.notSharedMessage'));
        }
      } catch (error) {
        console.error('[Noto] export note failed', error);
        Alert.alert(t('export.errorTitle'), t('export.errorMessage'));
      } finally {
        setExporting(false);
      }
    },
    [services],
  );

  const exportCurrentNote = useCallback(() => {
    if (state.status !== 'ready') return;
    const { note, tags, notebook } = state;
    if (countAttachmentReferences(note.content) > 0) {
      Alert.alert(t('export.attachmentTitle'), t('export.attachmentMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('export.continue'), onPress: () => void performExport(note, tags, notebook) },
      ]);
      return;
    }
    void performExport(note, tags, notebook);
  }, [state, performExport]);

  const remove = useCallback(() => {
    Alert.alert(t('note.deleteTitle'), t('note.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('note.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await services.notes.deleteNote(noteId);
              router.replace('/');
            } catch (error) {
              console.error('[Noto] delete note failed', error);
              Alert.alert(t('note.deleteError'));
            }
          })();
        },
      },
    ]);
  }, [services, noteId]);

  const openLink = useCallback(
    (wikilink: Wikilink, noteLink: NoteLink | null) => {
      if (noteLink?.resolution === 'resolved' && noteLink.targetNoteId) {
        router.push({ pathname: '/note/[id]', params: { id: noteLink.targetNoteId } });
        return;
      }
      if (noteLink?.resolution === 'ambiguous') {
        router.push({
          pathname: '/note/[id]/link-target',
          params: { id: noteId, linkId: noteLink.id, target: wikilink.target },
        });
        return;
      }
      Alert.alert(
        t('link.unresolvedTitle'),
        `${t('link.unresolvedMessage')}\n\n"${wikilink.target}"`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('link.create'),
            onPress: () => {
              void (async () => {
                try {
                  const created = await services.notes.createNote({ title: wikilink.target });
                  router.push({ pathname: '/note/[id]', params: { id: created.id } });
                } catch (error) {
                  console.error('[Noto] create note from link failed', error);
                  Alert.alert(t('link.createError'));
                }
              })();
            },
          },
        ],
      );
    },
    [services, noteId],
  );

  const refreshAttachments = useCallback(async () => {
    const attachments = await services.attachments.listForNote(noteId);
    setState((current) => (current.status === 'ready' ? { ...current, attachments } : current));
  }, [services, noteId]);

  const ensureCameraPermission = useCallback(async (): Promise<boolean> => {
    const current = await services.media.getPermission('camera');
    if (current.state === 'unavailable') {
      Alert.alert(t('attachments.permTitle'), t('attachments.permUnavailable'));
      return false;
    }
    if (current.state === 'granted') return true;
    const requested = await services.media.requestPermission('camera');
    if (requested.state === 'granted') return true;
    Alert.alert(t('attachments.permTitle'), t('attachments.permBlocked'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('attachments.openSettings'), onPress: () => void Linking.openSettings() },
    ]);
    return false;
  }, [services]);

  const addFromGallery = useCallback(async () => {
    if (attaching) return;
    setAttaching(true);
    try {
      // Best-effort on Android: the system photo picker grants per-item access, so a
      // denied media-library permission must not block the picker (Implementation Decision).
      const permission = await services.media.getPermission('library');
      if (
        permission.state !== 'granted' &&
        (permission.state === 'undetermined' || permission.canAskAgain)
      ) {
        await services.media.requestPermission('library');
      }
      const picked = await services.media.pickFromLibrary();
      if (!picked) return;
      await services.attachments.addImage({ noteId, source: picked });
      await refreshAttachments();
    } catch (error) {
      console.error('[Noto] add image from gallery failed', error);
      Alert.alert(t('attachments.addError'));
    } finally {
      setAttaching(false);
    }
  }, [attaching, services, noteId, refreshAttachments]);

  const addFromCamera = useCallback(async () => {
    if (attaching) return;
    setAttaching(true);
    try {
      if (!(await ensureCameraPermission())) return;
      const picked = await services.media.captureWithCamera();
      if (!picked) return;
      await services.attachments.addImage({ noteId, source: picked });
      await refreshAttachments();
    } catch (error) {
      console.error('[Noto] camera capture failed', error);
      Alert.alert(t('attachments.addError'));
    } finally {
      setAttaching(false);
    }
  }, [attaching, ensureCameraPermission, services, noteId, refreshAttachments]);

  const removeAttachment = useCallback(
    (view: AttachmentView) => {
      Alert.alert(t('attachments.deleteTitle'), t('attachments.deleteMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('attachments.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setAttaching(true);
              try {
                await services.attachments.remove(view.attachment.id);
                await refreshAttachments();
              } catch (error) {
                console.error('[Noto] delete attachment failed', error);
                Alert.alert(t('attachments.deleteError'));
              } finally {
                setAttaching(false);
              }
            })();
          },
        },
      ]);
    },
    [services, refreshAttachments],
  );

  const headerTitle =
    state.status === 'ready'
      ? state.note.title.trim() || t('home.untitled')
      : t('note.detailTitle');

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: headerTitle }} />
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('note.loading')}
            </ThemedText>
          </View>
        ) : state.status === 'notFound' ? (
          <View style={styles.center}>
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('note.notFound')}
            </ThemedText>
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.center}>
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('note.error')}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setState({ status: 'loading' });
                void (async () => {
                  try {
                    const bundle = await fetchBundle();
                    setState(bundle ? { status: 'ready', ...bundle } : { status: 'notFound' });
                  } catch (error) {
                    setState({ status: 'error', error: toError(error) });
                  }
                })();
              }}
              style={[styles.retry, { backgroundColor: colors.accent }]}
            >
              <ThemedText style={styles.retryLabel}>{t('common.retry')}</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={styles.content}>
              <ThemedText style={[styles.noteTitle, { color: colors.text }]}>
                {state.note.title.trim() || t('home.untitled')}
              </ThemedText>
              {state.note.content.trim().length > 0 ? (
                <NoteContent
                  content={state.note.content}
                  links={state.links}
                  onPressLink={openLink}
                  style={[styles.body, { color: colors.text }]}
                />
              ) : (
                <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                  {t('home.noContent')}
                </ThemedText>
              )}
              <View style={styles.metaRow}>
                <ThemedText variant="caption" color={colors.textFaint}>
                  {formatDateTime(state.note.updatedAt)}
                </ThemedText>
                {state.notebook ? (
                  <>
                    <View style={[styles.metaDot, { backgroundColor: colors.textFaint }]} />
                    <ThemedText variant="caption" color={colors.textFaint}>
                      {state.notebook.name}
                    </ThemedText>
                  </>
                ) : null}
              </View>

              {state.tags.length > 0 ? (
                <View style={styles.tagChips}>
                  {state.tags.map((tag) => (
                    <ThemedText
                      key={tag.id}
                      variant="caption"
                      color={colors.accent}
                      style={[styles.tagChip, { backgroundColor: colors.accentMuted }]}
                    >
                      #{tag.displayName}
                    </ThemedText>
                  ))}
                </View>
              ) : null}

              <AttachmentSection
                views={state.attachments}
                busy={attaching}
                onAddGallery={() => void addFromGallery()}
                onAddCamera={() => void addFromCamera()}
                onRecord={() =>
                  router.push({ pathname: '/note/[id]/record', params: { id: state.note.id } })
                }
                onDelete={removeAttachment}
              />

              <View style={[styles.backlinks, { borderTopColor: colors.border }]}>
                <ThemedText style={[styles.backlinksTitle, { color: colors.textMuted }]}>
                  {t('link.backlinks')}
                </ThemedText>
                {state.backlinks.length === 0 ? (
                  <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                    {t('link.backlinksEmpty')}
                  </ThemedText>
                ) : (
                  state.backlinks.map((source) => (
                    <Pressable
                      key={source.id}
                      accessibilityRole="link"
                      onPress={() =>
                        router.push({ pathname: '/note/[id]', params: { id: source.id } })
                      }
                      style={[styles.backlinkRow, { borderColor: colors.border }]}
                    >
                      <ThemedText style={[styles.backlinkTitle, { color: colors.text }]}>
                        {source.title.trim() || t('home.untitled')}
                      </ThemedText>
                      <ThemedText style={[styles.backlinkMeta, { color: colors.textMuted }]}>
                        {formatDateTime(source.updatedAt)}
                      </ThemedText>
                    </Pressable>
                  ))
                )}
              </View>
            </ScrollView>

            <View style={[styles.actions, { borderTopColor: colors.border }]}>
              <PrimaryButton
                label={t('note.edit')}
                onPress={() =>
                  router.push({ pathname: '/note/[id]/edit', params: { id: state.note.id } })
                }
                style={styles.primaryAction}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={exporting ? t('editor.saving') : t('export.action')}
                disabled={exporting}
                onPress={exportCurrentNote}
                style={[
                  styles.iconAction,
                  { backgroundColor: colors.surface, opacity: exporting ? 0.5 : 1 },
                ]}
              >
                <ThemedText variant="label" color={colors.text}>
                  {exporting ? t('editor.saving') : t('export.action')}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('note.delete')}
                onPress={remove}
                style={[styles.iconAction, { backgroundColor: colors.dangerMuted }]}
              >
                <ThemedText variant="label" color={colors.danger}>
                  {t('note.delete')}
                </ThemedText>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  noteTitle: { ...type.title },
  body: { ...type.body },
  tagChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaDot: { width: 3, height: 3, borderRadius: radius.full },
  tagChip: {
    ...type.label,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  backlinks: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  backlinksTitle: { ...type.label },
  backlinkRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  backlinkTitle: { ...type.subhead },
  backlinkMeta: { ...type.caption },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { ...type.subhead, textAlign: 'center' },
  retry: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  retryLabel: { color: '#FFFFFF', ...type.body },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryAction: { flex: 1 },
  iconAction: {
    minHeight: 50,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
});
