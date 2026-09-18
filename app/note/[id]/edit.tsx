import { router, Stack, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import {
  findActiveLinkQuery,
  replaceActiveLinkQuery,
} from '@/features/links/domain/wikilink-parser';
import {
  AUTOSAVE_DEBOUNCE_MS,
  createAutosaveController,
  type AutosaveController,
  type AutosaveStatus,
} from '@/features/notes/application/autosave-controller';
import type { Note } from '@/features/notes/domain/note';
import { PrimaryButton } from '@/ui/components/primary-button';
import { formatDateTime } from '@/ui/format/date';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';
type EditorValue = { title: string; content: string };

/** How long to wait after a keystroke before querying title suggestions. */
const SUGGEST_DEBOUNCE_MS = 200;

function statusLabel(status: AutosaveStatus): string {
  switch (status) {
    case 'saved':
      return t('editor.statusSaved');
    case 'saving':
      return t('editor.statusSaving');
    case 'unsaved':
      return t('editor.statusUnsaved');
    case 'error':
      return t('editor.statusError');
  }
}

export default function NoteEditScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const noteId = String(id);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<AutosaveStatus>('saved');
  const [suggestions, setSuggestions] = useState<Note[]>([]);

  const latestRef = useRef<EditorValue>({ title: '', content: '' });
  const controllerRef = useRef<AutosaveController | null>(null);
  const statusRef = useRef<AutosaveStatus>('saved');
  const cursorRef = useRef(0);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestSeqRef = useRef(0);

  const applyStatus = useCallback((next: AutosaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(
    () => () => {
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    },
    [],
  );

  const requestSuggestions = useCallback(
    (text: string, cursor: number) => {
      if (suggestTimerRef.current) {
        clearTimeout(suggestTimerRef.current);
        suggestTimerRef.current = null;
      }
      const active = findActiveLinkQuery(text, cursor);
      if (!active) {
        setSuggestions([]);
        return;
      }
      const seq = ++suggestSeqRef.current;
      suggestTimerRef.current = setTimeout(() => {
        void services.links
          .suggest(active.query)
          .then((notes) => {
            if (seq !== suggestSeqRef.current) return;
            setSuggestions(notes);
          })
          .catch(() => undefined);
      }, SUGGEST_DEBOUNCE_MS);
    },
    [services],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const note = await services.notes.getNote(noteId);
          if (!active) return;
          if (!note) {
            setLoadState('notFound');
            return;
          }

          const value: EditorValue = { title: note.title, content: note.content };
          latestRef.current = value;
          setTitle(value.title);
          setContent(value.content);

          const controller = createAutosaveController<EditorValue>({
            read: () => latestRef.current,
            write: async (next) => {
              await services.notes.updateNote(noteId, next);
            },
            equals: (a, b) => a.title === b.title && a.content === b.content,
            onStatus: (next) => {
              if (!active) return;
              statusRef.current = next;
              setStatus(next);
            },
            debounceMs: AUTOSAVE_DEBOUNCE_MS,
          });
          controllerRef.current = controller;
          applyStatus('saved');
          setLoadState('ready');
        } catch {
          if (active) setLoadState('error');
        }
      })();

      return () => {
        active = false;
        const controller = controllerRef.current;
        controllerRef.current = null;
        if (controller) {
          // Flush the latest content when leaving the screen.
          void controller.flush().catch(() => undefined);
          controller.dispose();
        }
      };
    }, [services, noteId, applyStatus]),
  );

  // Warn before leaving only when the last save actually failed, so content is never
  // silently discarded (docs/UX_FLOW.md §5).
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (statusRef.current !== 'error') return;
      event.preventDefault();
      Alert.alert(t('editor.unsavedTitle'), t('editor.unsavedMessage'), [
        { text: t('editor.keepEditing'), style: 'cancel' },
        {
          text: t('editor.discard'),
          style: 'destructive',
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  const onChangeTitle = useCallback((value: string) => {
    latestRef.current = { ...latestRef.current, title: value };
    setTitle(value);
    controllerRef.current?.change();
  }, []);

  const onChangeContent = useCallback(
    (value: string) => {
      latestRef.current = { ...latestRef.current, content: value };
      setContent(value);
      controllerRef.current?.change();
      requestSuggestions(value, cursorRef.current);
    },
    [requestSuggestions],
  );

  const onSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      cursorRef.current = event.nativeEvent.selection.end;
    },
    [],
  );

  const pickSuggestion = useCallback((note: Note) => {
    const current = latestRef.current.content;
    const active = findActiveLinkQuery(current, cursorRef.current);
    if (!active) {
      setSuggestions([]);
      return;
    }
    const next = replaceActiveLinkQuery(current, active.start, cursorRef.current, note.title);
    latestRef.current = { ...latestRef.current, content: next };
    setContent(next);
    controllerRef.current?.change();
    suggestSeqRef.current += 1;
    setSuggestions([]);
  }, []);

  const hasDuplicateTitles =
    new Set(suggestions.map((note) => note.titleKey)).size !== suggestions.length;

  const saveNow = useCallback(() => {
    void controllerRef.current?.flush();
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('editor.title') }} />
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loadState === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('note.loading')}
            </ThemedText>
          </View>
        ) : loadState === 'notFound' ? (
          <View style={styles.center}>
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('note.notFound')}
            </ThemedText>
          </View>
        ) : loadState === 'error' ? (
          <View style={styles.center}>
            <ThemedText style={[styles.message, { color: colors.textMuted }]}>
              {t('note.error')}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.statusRow}>
              <ThemedText
                accessibilityRole="text"
                style={[
                  styles.status,
                  {
                    color:
                      status === 'error'
                        ? colors.danger
                        : status === 'saved'
                          ? colors.success
                          : colors.textMuted,
                  },
                ]}
              >
                {statusLabel(status)}
              </ThemedText>
            </View>

            <ThemedText style={[styles.label, { color: colors.textMuted }]}>
              {t('editor.titleLabel')}
            </ThemedText>
            <TextInput
              value={title}
              onChangeText={onChangeTitle}
              style={[
                styles.titleInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            />

            <ThemedText style={[styles.label, { color: colors.textMuted }]}>
              {t('editor.contentLabel')}
            </ThemedText>
            <TextInput
              value={content}
              onChangeText={onChangeContent}
              onSelectionChange={onSelectionChange}
              multiline
              textAlignVertical="top"
              style={[
                styles.contentInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            />

            {suggestions.length > 0 ? (
              <View
                style={[
                  styles.suggestions,
                  { borderColor: colors.border, backgroundColor: colors.surfaceRaised },
                ]}
              >
                <ThemedText style={[styles.suggestLabel, { color: colors.textMuted }]}>
                  {t('link.suggestions')}
                </ThemedText>
                {hasDuplicateTitles ? (
                  <ThemedText style={[styles.suggestHint, { color: colors.warning }]}>
                    {t('link.multipleMatches')}
                  </ThemedText>
                ) : null}
                <ScrollView style={styles.suggestList} keyboardShouldPersistTaps="handled">
                  {suggestions.map((note) => (
                    <Pressable
                      key={note.id}
                      accessibilityRole="button"
                      onPress={() => pickSuggestion(note)}
                      style={styles.suggestRow}
                    >
                      <ThemedText
                        numberOfLines={1}
                        style={[styles.suggestTitle, { color: colors.text }]}
                      >
                        {note.title.trim() || t('home.untitled')}
                      </ThemedText>
                      <ThemedText
                        numberOfLines={1}
                        style={[styles.suggestMeta, { color: colors.textMuted }]}
                      >
                        {formatDateTime(note.updatedAt)}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {status === 'error' ? (
              <ThemedText style={[styles.error, { color: colors.danger }]}>
                {t('editor.error')}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                label={t('common.cancel')}
                variant="secondary"
                onPress={() => router.back()}
              />
              <PrimaryButton
                label={status === 'error' ? t('editor.retry') : t('editor.save')}
                onPress={saveNow}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  statusRow: { alignItems: 'flex-end' },
  status: { ...type.caption },
  label: { ...type.label },
  titleInput: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...type.heading,
  },
  contentInput: {
    flex: 1,
    minHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    ...type.body,
  },
  suggestions: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  suggestLabel: { ...type.caption },
  suggestHint: { ...type.caption },
  suggestList: { maxHeight: 160 },
  suggestRow: { paddingVertical: spacing.sm },
  suggestTitle: { ...type.subhead },
  suggestMeta: { ...type.caption },
  error: { ...type.subhead },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { ...type.subhead, textAlign: 'center' },
});
