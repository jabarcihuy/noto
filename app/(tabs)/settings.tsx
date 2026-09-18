import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import type { VaultStage } from '@/features/vault';
import { InfoCard } from '@/ui/components/info-card';
import { ListRow, ListSection } from '@/ui/components/list-section';
import { PrimaryButton } from '@/ui/components/primary-button';
import { Screen } from '@/ui/components/screen';
import { ThemedText } from '@/ui/components/themed-text';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, spacing } from '@/ui/theme';

type Busy = 'none' | 'reconcile' | 'export' | 'importFile' | 'importFolder' | 'diagnostics';

function stageLabel(stage: VaultStage): string {
  switch (stage) {
    case 'preparing':
      return t('vault.stage.preparing');
    case 'reading':
      return t('vault.stage.reading');
    case 'validating':
      return t('vault.stage.validating');
    case 'writing':
      return t('vault.stage.writing');
    case 'finalizing':
      return t('vault.stage.finalizing');
    case 'complete':
      return t('vault.stage.complete');
  }
}

export default function SettingsScreen() {
  const colors = getTheme(useColorScheme());
  const services = useAppServices();
  const [busy, setBusy] = useState<Busy>('none');
  const [stage, setStage] = useState<VaultStage | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const reconcile = useCallback(async () => {
    setBusy('reconcile');
    setSummary(null);
    try {
      const report = await services.attachments.reconcile();
      setSummary(
        `${t('reconcile.done')} · ${t('reconcile.missing')}: ${report.missing.length} · ` +
          `${t('reconcile.orphan')}: ${report.orphan.length}`,
      );
    } catch (error) {
      console.error('[Noto] attachment reconciliation failed', error);
      setSummary(t('reconcile.error'));
    } finally {
      setBusy('none');
    }
  }, [services]);

  const exportVault = useCallback(async () => {
    setBusy('export');
    setSummary(null);
    setStage('preparing');
    try {
      const result = await services.vault.exportVault({ onStage: setStage });
      const lines = [`${t('vault.exportDone')} · ${result.noteCount} ${t('vault.notes')}`];
      if (result.usedFallback) lines.push(t('vault.exportFallback'));
      if (result.missingAttachments.length > 0) {
        lines.push(`${t('vault.exportMissing')}: ${result.missingAttachments.length}`);
      }
      setSummary(lines.join('\n'));
    } catch (error) {
      console.error('[Noto] vault export failed', error);
      setSummary(t('vault.error'));
    } finally {
      setBusy('none');
      setStage(null);
    }
  }, [services]);

  const runImport = useCallback(
    async (mode: 'file' | 'folder') => {
      setBusy(mode === 'file' ? 'importFile' : 'importFolder');
      setSummary(null);
      setStage('reading');
      try {
        const result =
          mode === 'file'
            ? await services.vault.pickAndImportFile({ onStage: setStage })
            : await services.vault.pickAndImportDirectory({ onStage: setStage });
        if (!result) {
          setSummary(t('vault.importCancelled'));
          return;
        }
        const lines = [
          result.status === 'partial' ? t('vault.importPartial') : t('vault.importDone'),
          `${result.importedNotes} ${t('vault.notes')} · ${result.importedAttachments} ${t('vault.attachments')}`,
        ];
        if (result.conflicts.length > 0) {
          lines.push(`${t('vault.conflicts')}: ${result.conflicts.length}`);
        }
        if (result.skippedFiles.length > 0) {
          lines.push(`${t('vault.skipped')}: ${result.skippedFiles.length}`);
        }
        setSummary(lines.join('\n'));
      } catch (error) {
        console.error('[Noto] vault import failed', error);
        setSummary(t('vault.error'));
      } finally {
        setBusy('none');
        setStage(null);
      }
    },
    [services],
  );

  const runDiagnostics = useCallback(async () => {
    setBusy('diagnostics');
    setSummary(null);
    try {
      const report = await services.diagnostics.run();
      setSummary(
        `${t('diagnostics.done')}\n` +
          `SQLite: ${report.integrity} · FTS5: ${report.fts5 ? 'ya' : 'tidak'} · ` +
          `${report.noteCount} ${t('vault.notes')}`,
      );
    } catch (error) {
      console.error('[Noto] diagnostics failed', error);
      setSummary(t('diagnostics.error'));
    } finally {
      setBusy('none');
    }
  }, [services]);

  const anyBusy = busy !== 'none';

  return (
    <Screen title={t('settings.title')} scroll>
      {summary ? <InfoCard>{summary}</InfoCard> : null}

      {stage && busy !== 'reconcile' ? (
        <ThemedText
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          variant="label"
          color={colors.accent}
        >
          {stageLabel(stage)}
        </ThemedText>
      ) : null}

      <ListSection title={t('vault.section')}>
        <ListRow
          label={t('vault.export')}
          detail={t('vault.exportDetail')}
          onPress={() => void exportVault()}
          disabled={anyBusy}
        />
        <ListRow
          label={t('vault.importFile')}
          onPress={() => void runImport('file')}
          disabled={anyBusy}
        />
        <ListRow
          label={t('vault.importFolder')}
          onPress={() => void runImport('folder')}
          disabled={anyBusy}
          last
        />
      </ListSection>

      <ListSection title={t('settings.maintenance')}>
        <ListRow
          label={t('reconcile.action')}
          detail={t('reconcile.detail')}
          onPress={() => void reconcile()}
          disabled={anyBusy}
        />
        <ListRow
          label={t('diagnostics.action')}
          detail={t('diagnostics.detail')}
          onPress={() => void runDiagnostics()}
          disabled={anyBusy}
          last
        />
      </ListSection>

      <ListSection title={t('settings.general')}>
        <ListRow label={t('settings.templates')} onPress={() => router.push('/templates')} />
        <ListRow label={t('settings.language')} />
        <ListRow label={t('settings.phase0')} onPress={() => router.push('/phase0')} last />
      </ListSection>

      <View style={styles.about}>
        <ThemedText variant="caption" color={colors.textFaint} style={styles.aboutText}>
          {t('settings.aboutShort')}
        </ThemedText>
        <PrimaryButton
          label={t('settings.aboutMore')}
          variant="ghost"
          onPress={() => setSummary(t('settings.about'))}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  about: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  aboutText: { textAlign: 'center' },
});
