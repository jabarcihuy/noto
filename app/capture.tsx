import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { consumePendingSharePayloads } from '@/features/capture';
import type { IncomingSharePayload } from '@/core/platform';
import { InfoCard } from '@/ui/components/info-card';
import { PrimaryButton } from '@/ui/components/primary-button';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

type Mode = 'text' | 'url' | 'share';

export default function CaptureScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const params = useLocalSearchParams<{ templateId?: string; mode?: string }>();
  const { templateId } = params;
  const mode: Mode = params.mode === 'url' ? 'url' : 'text';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  // Share payloads are read once, synchronously, so no effect-driven state update is needed.
  const [sharePayloads] = useState<IncomingSharePayload[]>(() => consumePendingSharePayloads());
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const appliedTemplateRef = useRef<string | null>(null);

  const isShare = sharePayloads.length > 0;
  const canSave =
    isShare ||
    (mode === 'url' ? url.trim().length > 0 : title.trim().length > 0 || content.trim().length > 0);

  useEffect(() => {
    if (isShare) return;
    const id = templateId ? String(templateId) : null;
    if (!id || appliedTemplateRef.current === id) return;
    appliedTemplateRef.current = id;

    let active = true;
    void (async () => {
      try {
        const template = await services.templates.getById(id);
        if (!active) return;
        if (!template) {
          setTemplateNotice(t('capture.templateMissing'));
          return;
        }
        setTemplateName(template.name);
        setContent(template.content);
      } catch (caught) {
        console.error('[Noto] load template failed', caught);
        if (active) setTemplateNotice(t('capture.templateMissing'));
      }
    })();
    return () => {
      active = false;
    };
  }, [templateId, services, isShare]);

  async function saveTextOrTemplate() {
    const note = await services.notes.createNote({ title: title.trim(), content });
    router.replace({ pathname: '/note/[id]', params: { id: note.id } });
  }

  async function saveUrl() {
    const result = await services.capture.saveUrl({ url });
    if (result.metadata === 'not-a-url') {
      Alert.alert(t('capture.urlInvalidTitle'), t('capture.urlInvalidMessage'));
    } else if (result.metadata === 'unavailable') {
      Alert.alert(t('capture.urlSavedTitle'), t('capture.urlSavedNoPreview'));
    }
    router.replace({ pathname: '/note/[id]', params: { id: result.note.id } });
  }

  async function saveShared() {
    let firstNoteId: string | null = null;
    let unsupported = 0;
    let failed = 0;
    for (const payload of sharePayloads) {
      try {
        const result = await services.capture.captureSharedPayload(payload);
        if (result.kind === 'note') {
          firstNoteId = firstNoteId ?? result.note.id;
        } else {
          unsupported += 1;
        }
      } catch (caught) {
        console.error('[Noto] shared payload failed', caught);
        failed += 1;
      }
    }

    if (firstNoteId) {
      if (unsupported > 0 || failed > 0) {
        setShareNotice(t('capture.sharePartial'));
        router.replace({ pathname: '/note/[id]', params: { id: firstNoteId } });
        return;
      }
      router.replace({ pathname: '/note/[id]', params: { id: firstNoteId } });
      return;
    }

    setShareNotice(failed > 0 ? t('capture.shareFailed') : t('capture.shareUnsupported'));
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (isShare) await saveShared();
      else if (mode === 'url') await saveUrl();
      else await saveTextOrTemplate();
    } catch (caught) {
      console.error('[Noto] create note failed', caught);
      setError(mode === 'url' ? t('capture.urlError') : t('capture.error'));
      setSaving(false);
    }
  }

  function cancel() {
    if (!canSave) {
      router.back();
      return;
    }
    Alert.alert(t('capture.discardTitle'), t('capture.discardMessage'), [
      { text: t('capture.keepEditing'), style: 'cancel' },
      { text: t('capture.discardConfirm'), style: 'destructive', onPress: () => router.back() },
    ]);
  }

  const headerTitle = isShare
    ? t('capture.shareTitle')
    : mode === 'url'
      ? t('capture.urlTitle')
      : t('capture.title');

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: headerTitle }} />
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          {templateName && !isShare ? (
            <ThemedText style={[styles.template, { color: colors.accent }]}>
              {`${t('capture.templateLabel')}: ${templateName}`}
            </ThemedText>
          ) : null}
          {templateNotice ? <InfoCard>{templateNotice}</InfoCard> : null}
          {shareNotice ? <InfoCard>{shareNotice}</InfoCard> : null}

          {isShare ? (
            <View style={styles.shareList}>
              <ThemedText style={[styles.label, { color: colors.textMuted }]}>
                {t('capture.shareReview')}
              </ThemedText>
              {sharePayloads.map((payload, index) => (
                <View
                  key={`${payload.shareType}-${index}`}
                  style={[
                    styles.shareRow,
                    { borderColor: colors.border, backgroundColor: colors.surface },
                  ]}
                >
                  <ThemedText style={[styles.shareKind, { color: colors.accent }]}>
                    {payload.shareType}
                  </ThemedText>
                  <ThemedText numberOfLines={3} style={[styles.shareValue, { color: colors.text }]}>
                    {payload.originalName ?? payload.value}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : mode === 'url' ? (
            <>
              <ThemedText style={[styles.label, { color: colors.textMuted }]}>
                {t('capture.urlLabel')}
              </ThemedText>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder={t('capture.urlPlaceholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('capture.urlPlaceholder')}
                editable={!saving}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[
                  styles.urlInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              <ThemedText style={[styles.hint, { color: colors.textMuted }]}>
                {t('capture.urlHint')}
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText style={[styles.label, { color: colors.textMuted }]}>
                {t('capture.titleLabel')}
              </ThemedText>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('capture.titlePlaceholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('capture.titleLabel')}
                editable={!saving}
                style={[
                  styles.titleInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />

              <ThemedText style={[styles.label, { color: colors.textMuted }]}>
                {t('capture.contentLabel')}
              </ThemedText>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder={t('capture.contentPlaceholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('capture.contentLabel')}
                editable={!saving}
                multiline
                textAlignVertical="top"
                style={[
                  styles.contentInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
            </>
          )}

          {error ? (
            <ThemedText style={[styles.error, { color: colors.danger }]}>{error}</ThemedText>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              label={t('common.cancel')}
              variant="secondary"
              onPress={cancel}
              disabled={saving}
            />
            <PrimaryButton
              label={saving ? t('capture.saving') : t('capture.save')}
              onPress={() => void save()}
              disabled={!canSave}
              loading={saving}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  label: { ...type.label },
  template: { ...type.label },
  hint: { ...type.label },
  titleInput: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...type.heading,
  },
  urlInput: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...type.body,
  },
  contentInput: {
    flex: 1,
    minHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    ...type.body,
  },
  shareList: { gap: spacing.sm },
  shareRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  shareKind: { ...type.caption },
  shareValue: { ...type.subhead },
  error: { ...type.subhead },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
});
