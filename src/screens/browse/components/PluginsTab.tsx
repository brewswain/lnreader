import { memo, useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  LegendList,
  LegendListRenderItemProps,
} from '@legendapp/list/react-native';

import {
  Button,
  ConfirmationDialog,
  EmptyView,
  IconButtonV2,
} from '@components';
import { useBackHandler } from '@hooks';
import {
  useFilteredAvailablePlugins,
  useInstalledPlugins,
  usePluginActions,
  usePluginIssueIndex,
} from '@hooks/persisted';
import { BrowseScreenProps } from '@navigators/types';
import {
  getPluginHealth,
  IssueCategory,
  PluginHealth,
} from '@plugins/pluginHealth';
import { PluginItem } from '@plugins/types';
import { getString } from '@i18n/translations';
import { ThemeColors } from '@theme/types';
import { getLocaleLanguageName } from '@utils/constants/languages';
import { showToast } from '@utils/showToast';
import {
  buildPluginEntries,
  PluginEntry,
  PluginStatus,
} from '../utils/buildBrowseEntries';

// Plugin sources come from raw.githubusercontent.com; a small pool keeps bulk
// installs quick without hammering it.
const BULK_INSTALL_CONCURRENCY = 4;

const getHealthLabel = (health: PluginHealth) => {
  if (health.category === IssueCategory.CantLoadNovels) {
    return getString('browseScreen.issueCantLoad');
  }
  if (health.category === IssueCategory.DomainChanged) {
    return getString('browseScreen.issueDomainChanged');
  }
  return getString('browseScreen.issueReported', {
    count: health.issueNumbers.length,
  });
};

interface PluginsTabProps {
  navigation: BrowseScreenProps['navigation'];
  searchText: string;
  theme: ThemeColors;
}

interface PluginRowProps {
  disabled: boolean;
  health?: PluginHealth;
  onInstall: (plugin: PluginItem) => void;
  onOpenDetails: (plugin: PluginItem) => void;
  onOpenWebsite: (plugin: PluginItem) => void;
  onToggleSelect: (plugin: PluginItem) => void;
  onUpdate: (plugin: PluginItem) => void;
  plugin: PluginItem;
  selected: boolean;
  selectionMode: boolean;
  status: PluginStatus;
  theme: ThemeColors;
}

const PluginRow = memo(
  ({
    disabled,
    health,
    onInstall,
    onOpenDetails,
    onOpenWebsite,
    onToggleSelect,
    onUpdate,
    plugin,
    selected,
    selectionMode,
    status,
    theme,
  }: PluginRowProps) => {
    const isInstalled = status !== 'available';
    const canPress = selectionMode || isInstalled;

    return (
      <View
        style={[
          styles.pluginRow,
          selected && { backgroundColor: theme.secondaryContainer },
        ]}
      >
        <Pressable
          accessibilityLabel={
            isInstalled && !selectionMode
              ? getString('browseScreen.openPluginDetails', {
                  name: plugin.name,
                })
              : plugin.name
          }
          accessibilityRole={selectionMode ? 'checkbox' : 'button'}
          accessibilityState={selectionMode ? { checked: selected } : undefined}
          style={styles.pluginRowAction}
          android_ripple={canPress ? { color: theme.rippleColor } : undefined}
          onPress={() =>
            selectionMode
              ? onToggleSelect(plugin)
              : isInstalled
              ? onOpenDetails(plugin)
              : undefined
          }
          onLongPress={() => onToggleSelect(plugin)}
        />
        <View pointerEvents="none" style={styles.pluginMainContent}>
          <Image
            source={{ uri: plugin.iconUrl }}
            style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
          />
          <View style={styles.details}>
            <Text
              numberOfLines={1}
              style={[styles.name, { color: theme.onSurface }]}
            >
              {plugin.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.description, { color: theme.onSurfaceVariant }]}
            >
              {`${getLocaleLanguageName(plugin.lang)} · ${plugin.version}`}
              {health ? (
                <Text
                  style={{
                    color:
                      health.status === 'broken' ? theme.error : theme.tertiary,
                  }}
                >
                  {` · ${getHealthLabel(health)}`}
                </Text>
              ) : null}
            </Text>
          </View>
        </View>
        {selectionMode ? (
          <View pointerEvents="none">
            <IconButtonV2
              name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
              color={selected ? theme.primary : theme.onSurfaceVariant}
              theme={theme}
            />
          </View>
        ) : (
          <>
            {status === 'available' ? (
              <IconButtonV2
                accessibilityLabel={getString('browseScreen.openWebsite', {
                  name: plugin.name,
                })}
                name="earth"
                color={theme.onSurfaceVariant}
                onPress={() => onOpenWebsite(plugin)}
                theme={theme}
              />
            ) : (
              <IconButtonV2
                accessibilityLabel={getString(
                  'browseScreen.openPluginSettings',
                  { name: plugin.name },
                )}
                name="cog-outline"
                color={theme.onSurfaceVariant}
                onPress={() => onOpenDetails(plugin)}
                theme={theme}
              />
            )}
            {status !== 'installed' ? (
              <IconButtonV2
                accessibilityLabel={
                  status === 'available'
                    ? getString('browseScreen.installPlugin', {
                        name: plugin.name,
                      })
                    : getString('browseScreen.updatePlugin', {
                        name: plugin.name,
                      })
                }
                name="download-outline"
                color={theme.onSurface}
                disabled={disabled}
                onPress={
                  status === 'available'
                    ? () => onInstall(plugin)
                    : () => onUpdate(plugin)
                }
                theme={theme}
              />
            ) : null}
          </>
        )}
      </View>
    );
  },
);

export const PluginsTab = memo(
  ({ navigation, searchText, theme }: PluginsTabProps) => {
    const installedPlugins = useInstalledPlugins();
    const availablePlugins = useFilteredAvailablePlugins();
    const issueIndex = usePluginIssueIndex();
    const { installPlugin, refreshPlugins, uninstallPlugin, updatePlugin } =
      usePluginActions();
    const [refreshing, setRefreshing] = useState(false);
    const [pendingPluginIds, setPendingPluginIds] = useState<Set<string>>(
      () => new Set(),
    );
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
      () => new Set(),
    );
    const [showUninstallDialog, setShowUninstallDialog] = useState(false);
    // Long-press enters selection implicitly; the Select button enters it
    // explicitly so the bar stays up even with nothing selected yet.
    const [selecting, setSelecting] = useState(false);
    const selectionMode = selecting || selectedIds.size > 0;

    const updatePendingState = useCallback(
      (pluginId: string, pending: boolean) => {
        setPendingPluginIds(current => {
          const updated = new Set(current);
          if (pending) {
            updated.add(pluginId);
          } else {
            updated.delete(pluginId);
          }
          return updated;
        });
      },
      [],
    );

    const install = useCallback(
      async (plugin: PluginItem) => {
        updatePendingState(plugin.id, true);
        try {
          await installPlugin(plugin);
          showToast(
            getString('browseScreen.installedPlugin', { name: plugin.name }),
          );
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
        } finally {
          updatePendingState(plugin.id, false);
        }
      },
      [installPlugin, updatePendingState],
    );

    const update = useCallback(
      async (plugin: PluginItem) => {
        updatePendingState(plugin.id, true);
        try {
          const version = await updatePlugin(plugin);
          showToast(getString('browseScreen.updatedTo', { version }));
        } catch (error) {
          showToast(error instanceof Error ? error.message : String(error));
        } finally {
          updatePendingState(plugin.id, false);
        }
      },
      [updatePendingState, updatePlugin],
    );

    const pluginsWithUpdates = useMemo(
      () => installedPlugins.filter(plugin => plugin.hasUpdate),
      [installedPlugins],
    );

    const updateAll = useCallback(async () => {
      await Promise.allSettled(pluginsWithUpdates.map(update));
    }, [pluginsWithUpdates, update]);

    const openDetails = useCallback(
      (plugin: PluginItem) =>
        navigation.navigate('PluginDetails', { pluginId: plugin.id }),
      [navigation],
    );

    const openWebsite = useCallback(
      (plugin: PluginItem) =>
        navigation.navigate('WebviewScreen', {
          name: plugin.name,
          url: plugin.site,
          pluginId: plugin.id,
        }),
      [navigation],
    );

    const entries = useMemo(
      () =>
        buildPluginEntries({
          availablePlugins,
          installedPlugins,
          issueIndex,
          searchText,
        }),
      [availablePlugins, installedPlugins, issueIndex, searchText],
    );

    const toggleSelect = useCallback((plugin: PluginItem) => {
      setSelectedIds(current => {
        const updated = new Set(current);
        if (updated.has(plugin.id)) {
          updated.delete(plugin.id);
        } else {
          updated.add(plugin.id);
        }
        return updated;
      });
    }, []);

    const clearSelection = useCallback(() => {
      setSelecting(false);
      setSelectedIds(new Set());
    }, []);

    useBackHandler(() => {
      if (selectionMode) {
        clearSelection();
        return true;
      }
      return false;
    });

    const visiblePluginIds = useMemo(
      () =>
        entries.flatMap(entry =>
          entry.type === 'plugin' ? [entry.plugin.id] : [],
        ),
      [entries],
    );

    const toggleSelectAll = useCallback(() => {
      setSelectedIds(current =>
        visiblePluginIds.every(id => current.has(id))
          ? new Set()
          : new Set(visiblePluginIds),
      );
    }, [visiblePluginIds]);

    const selectAll = useCallback(() => {
      setSelecting(true);
      setSelectedIds(new Set(visiblePluginIds));
    }, [visiblePluginIds]);

    const { selectedAvailable, selectedInstalled } = useMemo(() => {
      const installedIds = new Set(installedPlugins.map(plugin => plugin.id));
      return {
        selectedAvailable: availablePlugins.filter(
          plugin => selectedIds.has(plugin.id) && !installedIds.has(plugin.id),
        ),
        selectedInstalled: installedPlugins.filter(plugin =>
          selectedIds.has(plugin.id),
        ),
      };
    }, [availablePlugins, installedPlugins, selectedIds]);

    const installSelected = useCallback(async () => {
      const queue = [...selectedAvailable];
      const total = queue.length;
      let done = 0;
      clearSelection();
      queue.forEach(plugin => updatePendingState(plugin.id, true));

      const worker = async () => {
        for (let plugin = queue.shift(); plugin; plugin = queue.shift()) {
          try {
            await installPlugin(plugin);
            done++;
          } catch {
            // Counted as not installed in the summary toast.
          } finally {
            updatePendingState(plugin.id, false);
          }
        }
      };
      await Promise.all(
        Array.from({ length: BULK_INSTALL_CONCURRENCY }, worker),
      );
      showToast(
        getString('browseScreen.installedPluginsCount', { done, total }),
      );
    }, [clearSelection, installPlugin, selectedAvailable, updatePendingState]);

    const uninstallSelected = useCallback(async () => {
      const targets = selectedInstalled;
      setShowUninstallDialog(false);
      clearSelection();
      const results = await Promise.allSettled(targets.map(uninstallPlugin));
      showToast(
        getString('browseScreen.uninstalledPluginsCount', {
          count: results.filter(result => result.status === 'fulfilled').length,
        }),
      );
    }, [clearSelection, selectedInstalled, uninstallPlugin]);

    const openRepositories = useCallback(
      () =>
        navigation.navigate('MoreStack', {
          screen: 'SettingsStack',
          params: { screen: 'RespositorySettings' },
        }),
      [navigation],
    );

    const openBrowseSettings = useCallback(
      () => navigation.navigate('BrowseSettings'),
      [navigation],
    );

    const renderItem = useCallback(
      ({ item }: LegendListRenderItemProps<PluginEntry>) => {
        if (item.type === 'header') {
          return (
            <View
              style={[
                styles.headerRow,
                item.action === 'updateAll' && styles.updateHeaderRow,
              ]}
            >
              <Text
                style={[
                  styles.sectionHeader,
                  { color: theme.onSurfaceVariant },
                ]}
              >
                {item.title}
              </Text>
              {item.action === 'updateAll' ? (
                <Button
                  compact
                  contentStyle={styles.updateAllButtonContent}
                  mode="contained-tonal"
                  onPress={updateAll}
                  style={styles.updateAllButton}
                  title={getString('browseScreen.updateAll')}
                />
              ) : null}
            </View>
          );
        }

        return (
          <PluginRow
            disabled={pendingPluginIds.has(item.plugin.id)}
            health={getPluginHealth(issueIndex, item.plugin.id)}
            onInstall={install}
            onOpenDetails={openDetails}
            onOpenWebsite={openWebsite}
            onToggleSelect={toggleSelect}
            onUpdate={update}
            plugin={item.plugin}
            selected={selectedIds.has(item.plugin.id)}
            selectionMode={selectionMode}
            status={item.status}
            theme={theme}
          />
        );
      },
      [
        install,
        issueIndex,
        openDetails,
        openWebsite,
        pendingPluginIds,
        selectedIds,
        selectionMode,
        theme,
        toggleSelect,
        update,
        updateAll,
      ],
    );

    const refresh = useCallback(async () => {
      setRefreshing(true);
      try {
        await refreshPlugins();
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error));
      } finally {
        setRefreshing(false);
      }
    }, [refreshPlugins]);

    return (
      <View style={styles.container}>
        {selectionMode ? (
          <View
            style={[
              styles.selectionBar,
              { borderBottomColor: theme.outlineVariant },
            ]}
          >
            <IconButtonV2
              accessibilityLabel={getString('common.cancel')}
              name="close"
              color={theme.onSurface}
              onPress={clearSelection}
              theme={theme}
            />
            <Text style={[styles.selectionTitle, { color: theme.onSurface }]}>
              {getString('browseScreen.selectedCount', {
                count: selectedIds.size,
              })}
            </Text>
            <IconButtonV2
              accessibilityLabel={getString('browseScreen.selectAllPlugins')}
              name="select-all"
              color={theme.onSurface}
              onPress={toggleSelectAll}
              theme={theme}
            />
            <IconButtonV2
              accessibilityLabel={getString('browseScreen.installSelected')}
              name="download-outline"
              color={theme.onSurface}
              disabled={!selectedAvailable.length}
              onPress={installSelected}
              theme={theme}
            />
            <IconButtonV2
              accessibilityLabel={getString('browseScreen.uninstallSelected')}
              name="delete-outline"
              color={theme.onSurface}
              disabled={!selectedInstalled.length}
              onPress={() => setShowUninstallDialog(true)}
              theme={theme}
            />
          </View>
        ) : visiblePluginIds.length ? (
          <View style={styles.selectActions}>
            <Button
              compact
              mode="text"
              onPress={() => setSelecting(true)}
              title={getString('browseScreen.selectPlugins')}
            />
            <Button
              compact
              mode="text"
              onPress={selectAll}
              title={getString('browseScreen.selectAll')}
            />
          </View>
        ) : null}
        <LegendList
          data={entries}
          estimatedItemSize={64}
          extraData={selectedIds}
          getItemType={item => item.type}
          keyExtractor={item => item.key}
          ListEmptyComponent={
            <EmptyView
              description={
                searchText.trim()
                  ? getString('browseScreen.noSearchResults')
                  : getString('browseScreen.noPlugins')
              }
              actions={
                searchText.trim()
                  ? undefined
                  : [
                      {
                        iconName: 'source-repository',
                        onPress: openRepositories,
                        title: getString('browseScreen.repositories'),
                      },
                      {
                        iconName: 'tune',
                        onPress: openBrowseSettings,
                        title: getString('browseSettings'),
                      },
                    ]
              }
              theme={theme}
            />
          }
          contentContainerStyle={!entries.length ? styles.emptyList : undefined}
          recycleItems
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[theme.onPrimary]}
              progressBackgroundColor={theme.primary}
            />
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
        <ConfirmationDialog
          title={getString('browseScreen.uninstall')}
          confirmLabel={getString('browseScreen.uninstall')}
          confirmTone="danger"
          visible={showUninstallDialog}
          message={getString('browseScreen.uninstallPluginsMessage', {
            count: selectedInstalled.length,
          })}
          onDismiss={() => setShowUninstallDialog(false)}
          onConfirm={uninstallSelected}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyList: {
    flexGrow: 1,
  },
  details: {
    flex: 1,
    marginStart: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  icon: {
    borderRadius: 4,
    height: 44,
    width: 44,
  },
  name: {
    fontSize: 14,
    lineHeight: 20,
  },
  pluginRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'relative',
  },
  pluginMainContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  pluginRowAction: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sectionHeader: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
  },
  selectActions: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  selectionBar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 4,
  },
  selectionTitle: {
    flex: 1,
    fontSize: 16,
    marginStart: 8,
  },
  updateAllButton: {
    borderRadius: 24,
  },
  updateAllButtonContent: {
    minHeight: 40,
    paddingHorizontal: 8,
  },
  updateHeaderRow: {
    minHeight: 64,
    paddingVertical: 8,
  },
});
