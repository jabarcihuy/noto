import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import type { CaptureType } from '@/features/notes/domain/note';
import type { Notebook } from '@/features/notebooks/domain/notebook';
import {
  isFilterActive,
  resolveDatePreset,
  type DatePreset,
  type SavedSearch,
  type SearchFilters,
  type SearchPage,
  type SearchSort,
} from '@/features/search';
import type { Tag } from '@/features/tags/domain/tag';
import { InfoCard } from '@/ui/components/info-card';
import { PrimaryButton } from '@/ui/components/primary-button';
import { Screen } from '@/ui/components/screen';
import { SearchResultRow } from '@/ui/components/search-result-row';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, radius, spacing } from '@/ui/theme/tokens';
import { ThemedText } from '@/ui/components/themed-text';

const PAGE_SIZE = 25;

type DateSelection = DatePreset | 'custom';
type CustomRange = { dateFrom: string | null; dateTo: string | null };
type Status = 'loading' | 'idle' | 'error';

const SORT_OPTIONS: { value: SearchSort; label: () => string }[] = [
  { value: 'updated_desc', label: () => t('search.sortUpdated') },
  { value: 'opened_desc', label: () => t('search.sortOpened') },
  { value: 'created_desc', label: () => t('search.sortNewest') },
  { value: 'created_asc', label: () => t('search.sortOldest') },
];

const DATE_OPTIONS: { value: DateSelection; label: () => string }[] = [
  { value: 'all', label: () => t('search.all') },
  { value: 'today', label: () => t('search.dateToday') },
  { value: 'week', label: () => t('search.dateWeek') },
  { value: 'month', label: () => t('search.dateMonth') },
];

function captureTypeLabel(type: CaptureType): string {
  switch (type) {
    case 'text':
      return t('captureType.text');
    case 'image':
      return t('captureType.image');
    case 'voice':
      return t('captureType.voice');
    case 'url':
      return t('captureType.url');
    case 'file':
      return t('captureType.file');
    case 'mixed':
      return t('captureType.mixed');
  }
}

export default function SearchScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [captureTypes, setCaptureTypes] = useState<CaptureType[]>([]);
  const [totalNotes, setTotalNotes] = useState<number | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notebookId, setNotebookId] = useState<string | null>(null);
  const [captureType, setCaptureType] = useState<CaptureType | null>(null);
  const [dateSelection, setDateSelection] = useState<DateSelection>('all');
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [sort, setSort] = useState<SearchSort>('updated_desc');

  const [page, setPage] = useState<SearchPage | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const range = useMemo(
    () => (dateSelection === 'custom' ? customRange : resolveDatePreset(dateSelection)),
    [dateSelection, customRange],
  );

  const filters = useMemo<SearchFilters>(() => {
    const result: SearchFilters = {};
    if (selectedTags.length > 0) result.tags = selectedTags;
    if (notebookId != null) result.notebookId = notebookId;
    if (captureType != null) result.captureType = captureType;
    if (range) {
      result.dateFrom = range.dateFrom;
      result.dateTo = range.dateTo;
    }
    return result;
  }, [selectedTags, notebookId, captureType, range]);

  const runSearch = useCallback(
    async (offset: number, append: boolean) => {
      const requestId = ++requestRef.current;
      if (append) setLoadingMore(true);
      else setStatus('loading');
      try {
        const result = await services.search.search({
          query: debouncedQuery,
          filters,
          sort,
          limit: PAGE_SIZE,
          offset,
        });
        if (requestId !== requestRef.current) return;
        setPage((previous) =>
          append && previous ? { ...result, items: [...previous.items, ...result.items] } : result,
        );
        setStatus('idle');
      } catch (error) {
        if (requestId === requestRef.current) {
          console.error('[Noto] search failed', error);
          setStatus('error');
        }
      } finally {
        if (requestId === requestRef.current) setLoadingMore(false);
      }
    },
    [services, debouncedQuery, filters, sort],
  );

  useEffect(() => {
    const handle = setTimeout(() => {
      void runSearch(0, false);
    }, 0);
    return () => clearTimeout(handle);
  }, [runSearch]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const [tags, notebookList, types, count, saved] = await Promise.all([
            services.tags.list(),
            services.notebooks.list(),
            services.search.listCaptureTypes(),
            services.search.countNotes(),
            services.search.listSavedSearches(),
          ]);
          if (!active) return;
          setAvailableTags(tags);
          setNotebooks(notebookList);
          setCaptureTypes(types);
          setTotalNotes(count);
          setSavedSearches(saved);
        } catch (error) {
          console.error('[Noto] search metadata failed', error);
        }
      })();
      return () => {
        active = false;
      };
    }, [services]),
  );

  const clearFilters = useCallback(() => {
    setSelectedTags([]);
    setNotebookId(null);
    setCaptureType(null);
    setDateSelection('all');
    setCustomRange(null);
  }, []);

  const toggleTag = useCallback((name: string) => {
    setSelectedTags((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );
  }, []);

  const applySaved = useCallback(
    (saved: SavedSearch) => {
      setQuery(saved.query);
      setDebouncedQuery(saved.query);
      setSelectedTags(saved.filters.tags ?? []);
      setNotebookId(saved.filters.notebookId ?? null);
      setCaptureType(saved.filters.captureType ?? null);
      if (saved.filters.dateFrom != null || saved.filters.dateTo != null) {
        setDateSelection('custom');
        setCustomRange({
          dateFrom: saved.filters.dateFrom ?? null,
          dateTo: saved.filters.dateTo ?? null,
        });
      } else {
        setDateSelection('all');
        setCustomRange(null);
      }
      setSort(saved.sort);
      const tagNames = new Set(availableTags.map((tag) => tag.name));
      const notebookIds = new Set(notebooks.map((notebook) => notebook.id));
      const stale =
        (saved.filters.tags ?? []).some((name) => !tagNames.has(name)) ||
        (saved.filters.notebookId != null && !notebookIds.has(saved.filters.notebookId));
      setNotice(stale ? t('search.savedStale') : null);
    },
    [availableTags, notebooks],
  );

  const saveCurrent = useCallback(async () => {
    const name = saveName.trim();
    if (name.length === 0) {
      setSaveError(t('search.savedNameRequired'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await services.search.createSavedSearch({ name, query: debouncedQuery, filters, sort });
      setSavedSearches(await services.search.listSavedSearches());
      setSaveOpen(false);
      setSaveName('');
      setNotice(t('search.savedSaved'));
    } catch (error) {
      console.error('[Noto] save search failed', error);
      setSaveError(t('search.savedError'));
    } finally {
      setSaving(false);
    }
  }, [services, saveName, debouncedQuery, filters, sort]);

  const activeFilterCount =
    (selectedTags.length > 0 ? 1 : 0) +
    (notebookId != null ? 1 : 0) +
    (captureType != null ? 1 : 0) +
    (dateSelection !== 'all' ? 1 : 0);

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.accent : colors.border,
          backgroundColor: selected ? colors.accentMuted : colors.surface,
        },
      ]}
    >
      <ThemedText style={[styles.chipText, { color: selected ? colors.accent : colors.text }]}>
        {selected ? `✓ ${label}` : label}
      </ThemedText>
    </Pressable>
  );

  const header = (
    <View style={styles.header}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t('search.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
        ]}
      />

      {services.search.isDegraded() ? <InfoCard>{t('search.degraded')}</InfoCard> : null}
      {notice ? <InfoCard>{notice}</InfoCard> : null}

      <View style={styles.rowBetween}>
        <ThemedText style={[styles.section, { color: colors.textMuted }]}>
          {t('search.filters')}
          {activeFilterCount > 0 ? ` · ${activeFilterCount} ${t('search.filtersActive')}` : ''}
        </ThemedText>
        {activeFilterCount > 0 ? (
          <Pressable accessibilityRole="button" onPress={clearFilters}>
            <ThemedText style={[styles.link, { color: colors.accent }]}>
              {t('search.clearFilters')}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      {availableTags.length > 0 ? (
        <View style={styles.filterBlock}>
          <ThemedText style={[styles.filterLabel, { color: colors.textMuted }]}>
            {t('search.tags')}
          </ThemedText>
          <View style={styles.chips}>
            {availableTags.map((tag) =>
              chip(
                tag.displayName,
                selectedTags.includes(tag.name),
                () => toggleTag(tag.name),
                tag.id,
              ),
            )}
          </View>
        </View>
      ) : null}

      {notebooks.length > 0 ? (
        <View style={styles.filterBlock}>
          <ThemedText style={[styles.filterLabel, { color: colors.textMuted }]}>
            {t('search.notebook')}
          </ThemedText>
          <View style={styles.chips}>
            {chip(t('search.all'), notebookId === null, () => setNotebookId(null), 'nb-all')}
            {notebooks.map((notebook) =>
              chip(
                notebook.name,
                notebookId === notebook.id,
                () => setNotebookId(notebook.id),
                notebook.id,
              ),
            )}
          </View>
        </View>
      ) : null}

      {captureTypes.length > 0 ? (
        <View style={styles.filterBlock}>
          <ThemedText style={[styles.filterLabel, { color: colors.textMuted }]}>
            {t('search.captureType')}
          </ThemedText>
          <View style={styles.chips}>
            {chip(t('search.all'), captureType === null, () => setCaptureType(null), 'type-all')}
            {captureTypes.map((type) =>
              chip(captureTypeLabel(type), captureType === type, () => setCaptureType(type), type),
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.filterBlock}>
        <ThemedText style={[styles.filterLabel, { color: colors.textMuted }]}>
          {t('search.date')}
        </ThemedText>
        <View style={styles.chips}>
          {DATE_OPTIONS.map((option) =>
            chip(
              option.label(),
              dateSelection === option.value,
              () => {
                setDateSelection(option.value);
                setCustomRange(null);
              },
              option.value,
            ),
          )}
          {dateSelection === 'custom'
            ? chip(t('search.dateSaved'), true, () => undefined, 'custom')
            : null}
        </View>
      </View>

      <View style={styles.filterBlock}>
        <ThemedText style={[styles.filterLabel, { color: colors.textMuted }]}>
          {t('search.sort')}
        </ThemedText>
        <View style={styles.chips}>
          {SORT_OPTIONS.map((option) =>
            chip(option.label(), sort === option.value, () => setSort(option.value), option.value),
          )}
        </View>
      </View>

      <View style={styles.rowBetween}>
        <ThemedText style={[styles.section, { color: colors.textMuted }]}>
          {t('search.savedTitle')}
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => setSaveOpen((value) => !value)}>
          <ThemedText style={[styles.link, { color: colors.accent }]}>
            {t('search.savedSave')}
          </ThemedText>
        </Pressable>
      </View>
      {saveOpen ? (
        <View style={styles.saveRow}>
          <TextInput
            value={saveName}
            onChangeText={setSaveName}
            placeholder={t('search.savedNamePlaceholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('search.savedNamePlaceholder')}
            style={[
              styles.input,
              styles.saveInput,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />
          <PrimaryButton
            label={t('search.savedSave')}
            loading={saving}
            disabled={saveName.trim().length === 0}
            onPress={() => void saveCurrent()}
          />
        </View>
      ) : null}
      {saveError ? (
        <ThemedText style={[styles.error, { color: colors.danger }]}>{saveError}</ThemedText>
      ) : null}
      {savedSearches.length === 0 ? (
        <ThemedText style={[styles.message, { color: colors.textMuted }]}>
          {t('search.savedEmpty')}
        </ThemedText>
      ) : (
        <View style={styles.chips}>
          {savedSearches.map((saved) => chip(saved.name, false, () => applySaved(saved), saved.id))}
        </View>
      )}
    </View>
  );

  const noNotes = totalNotes === 0;
  const hasCriteria = debouncedQuery.trim().length > 0 || isFilterActive(filters);
  const emptyState = noNotes
    ? t('search.noNotes')
    : activeFilterCount > 0 && debouncedQuery.trim().length === 0
      ? t('search.noFilterResults')
      : t('search.noResults');

  return (
    <Screen title={t('search.title')} scroll={false}>
      <FlatList
        data={page?.items ?? []}
        keyExtractor={(item) => item.note.id}
        renderItem={({ item }) => (
          <SearchResultRow
            item={item}
            onPress={() => router.push({ pathname: '/note/[id]', params: { id: item.note.id } })}
          />
        )}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        style={styles.flex}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('search.loading')}
              </ThemedText>
            </View>
          ) : status === 'error' ? (
            <View style={styles.center}>
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {t('search.error')}
              </ThemedText>
              <PrimaryButton label={t('common.retry')} onPress={() => void runSearch(0, false)} />
            </View>
          ) : (
            <View style={styles.center}>
              <ThemedText style={[styles.message, { color: colors.textMuted }]}>
                {emptyState}
              </ThemedText>
              {hasCriteria && !noNotes ? (
                <Pressable accessibilityRole="button" onPress={clearFilters}>
                  <ThemedText style={[styles.link, { color: colors.accent }]}>
                    {t('search.clearFilters')}
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          page && page.items.length > 0 && page.hasMore ? (
            <View style={styles.footer}>
              {loadingMore ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <PrimaryButton
                  label={t('search.loadMore')}
                  variant="secondary"
                  onPress={() => void runSearch(page.items.length, true)}
                />
              )}
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: spacing.xxl },
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  saveRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  saveInput: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontSize: 13 },
  filterBlock: { gap: spacing.xs },
  filterLabel: { fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { fontSize: 13 },
  link: { fontSize: 14 },
  message: { fontSize: 15, textAlign: 'center' },
  error: { fontSize: 14 },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
});
