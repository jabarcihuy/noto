import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, useColorScheme } from 'react-native';

import type { VaultStage } from '@/features/vault';
import { PrimaryButton } from '@/ui/components/primary-button';
import { InfoCard } from '@/ui/components/info-card';
import { Screen } from '@/ui/components/screen';
import { t } from '@/ui/i18n';
import { useAppServices } from '@/ui/providers/app-provider';
import { getTheme, spacing, type } from '@/ui/theme';
import { ThemedText } from '@/ui/components/themed-text';

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
        `${t('reconcile.done')}\n` +
          `${t('reconcile.matched')}: ${report.matched} · ` +
          `${t('reconcile.missing')}: ${report.missing.length} · ` +
          `${t('reconcile.orphan')}: ${report.orphan.length} · ` +
          `${t('reconcile.pending')}: ${report.pendingRemaining}`,
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
      const lines = [
        t('vault.exportDone'),
        `${t('vault.notes')}: ${result.noteCount} · ${t('vault.attachments')}: ${result.attachmentCount}`,
      ];
      if (result.usedFallback) lines.push(t('vault.exportFallback'));
      if (result.missingAttachments.length > 0) {
        lines.push(`${t('vault.exportMissing')}: ${result.missingAttachments.length}`);
      }
      if (result.warnings.length > 0) {
        lines.push(`${t('vault.exportWarnings')}: ${result.warnings.length}`);
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
          `${t('vault.importedNotes')}: ${result.importedNotes} · ` +
            `${t('vault.importedAttachments')}: ${result.importedAttachments} · ` +
            `${t('vault.importedNotebooks')}: ${result.createdNotebooks}`,
          `${t('vault.importedTemplates')}: ${result.importedTemplates} · ` +
            `${t('vault.importedSavedSearches')}: ${result.importedSavedSearches}`,
        ];
        if (result.conflicts.length > 0) {
          lines.push(`${t('vault.conflicts')}: ${result.conflicts.length}`);
        }
        if (result.warnings.length > 0) {
          lines.push(`${t('vault.warnings')}: ${result.warnings.length}`);
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
          `SQLite: ${report.integrity} · FK: ${report.foreignKeyViolations}\n` +
          `${t('diagnostics.schema')}: ${report.schemaVersion} · FTS5: ${report.fts5 ? 'ya' : 'tidak'}\n` +
          `${t('vault.notes')}: ${report.noteCount} · ${t('vault.attachments')}: ${report.attachmentCount}`,
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
      <InfoCard>{t('settings.about')}</InfoCard>
      <InfoCard>{t('settings.language')}</InfoCard>
      <InfoCard>{t('vault.zipNote')}</InfoCard>

      <ThemedText style={[styles.section, { color: colors.textMuted }]}>
        {t('vault.section')}
      </ThemedText>
      <PrimaryButton
        label={t('vault.export')}
        loading={busy === 'export'}
        disabled={anyBusy}
        onPress={() => void exportVault()}
      />
      <PrimaryButton
        label={t('vault.importFile')}
        variant="secondary"
        loading={busy === 'importFile'}
        disabled={anyBusy}
        onPress={() => void runImport('file')}
      />
      <PrimaryButton
        label={t('vault.importFolder')}
        variant="secondary"
        loading={busy === 'importFolder'}
        disabled={anyBusy}
        onPress={() => void runImport('folder')}
      />
      {stage && busy !== 'reconcile' ? (
        <ThemedText
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          style={[styles.stage, { color: colors.accent }]}
        >
          {stageLabel(stage)}
        </ThemedText>
      ) : null}

      <PrimaryButton
        label={busy === 'reconcile' ? t('reconcile.running') : t('reconcile.action')}
        variant="secondary"
        loading={busy === 'reconcile'}
        disabled={anyBusy}
        onPress={() => void reconcile()}
      />
      <PrimaryButton
        label={t('diagnostics.action')}
        variant="secondary"
        loading={busy === 'diagnostics'}
        disabled={anyBusy}
        onPress={() => void runDiagnostics()}
      />
      {summary ? <InfoCard>{summary}</InfoCard> : null}

      <Pressable accessibilityRole="link" onPress={() => router.push('/templates')}>
        <ThemedText style={[styles.link, { color: colors.accent }]}>
          {t('settings.templates')}
        </ThemedText>
      </Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.push('/phase0')}>
        <ThemedText style={[styles.link, { color: colors.accent }]}>
          {t('settings.phase0')}
        </ThemedText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...type.label, marginTop: spacing.md },
  stage: { ...type.subhead },
  link: { ...type.subhead, marginTop: spacing.sm },
});
