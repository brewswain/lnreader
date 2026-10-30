import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FAB, ProgressBar } from 'react-native-paper';
import {
  SlideInRight,
  SlideOutRight,
  createAnimatedComponent,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { getStringAsync } from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';

import {
  EmptyView,
  SafeAreaView,
  SearchbarV2,
  SelectableChip,
} from '@components/index';
import GlobalSearchResultsList from './components/GlobalSearchResultsList';

import { useSearch } from '@hooks';
import { useBrowseSettings, useTheme } from '@hooks/persisted';

import { getString } from '@i18n/translations';
import { navigationRef } from '@navigators/ShareIntentHandler';
import { resolveSharedUrl } from '@services/share/resolveSharedUrl';
import { showToast } from '@utils/showToast';
import { useGlobalSearch } from './hooks/useGlobalSearch';

const AnimatedFAB = createAnimatedComponent(FAB);

interface Props {
  route?: {
    params?: {
      searchText?: string;
    };
  };
}

const GlobalSearchScreen = (props: Props) => {
  const theme = useTheme();
  const { searchText, setSearchText, clearSearchbar } = useSearch(
    props?.route?.params?.searchText,
    false,
  );
  const onChangeText = (text: string) => setSearchText(text);

  const [hasResultsOnly, setHasResultsOnly] = useState(true);
  const {
    globalSearchPinnedOnly = false,
    globalSearchEnglishOnly = false,
    setBrowseSettings,
  } = useBrowseSettings();
  const [clipboardNovel, setClipboardNovel] = useState<
    { pluginId: string; path: string } | undefined
  >();
  // Edge-to-edge: the IME overlays the screen, so the FAB must float above it.
  // Shared values track the keyboard frame-by-frame, so the FAB moves with it.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const fabPositionStyle = useAnimatedStyle(() => ({
    // The library reports the keyboard height as a negative value (the
    // translateY convention), so negate it for bottom positioning.
    bottom: Math.max(16, -keyboardHeight.value),
  }));

  // Only a URL matching an installed source is offered from the clipboard.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getStringAsync()
        .then(text => {
          const result = text ? resolveSharedUrl(text) : undefined;
          if (active) {
            setClipboardNovel(
              result?.kind === 'novel'
                ? { pluginId: result.pluginId, path: result.path }
                : undefined,
            );
          }
        })
        .catch(() => {
          // Clipboard unreadable — nothing to offer.
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const { searchResults, progress } = useGlobalSearch({
    defaultSearchText: searchText,
    hasResultsOnly,
  });

  const searchUrlResult = useMemo(
    () => resolveSharedUrl(searchText),
    [searchText],
  );

  const openNovel = useCallback((novel: { pluginId: string; path: string }) => {
    navigationRef.navigate('ReaderStack', {
      screen: 'Novel',
      params: {
        name: '',
        path: novel.path,
        pluginId: novel.pluginId,
        cover: null,
      },
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (searchUrlResult?.kind === 'novel') {
      openNovel(searchUrlResult);
    } else if (searchUrlResult) {
      // Valid URL but no matching installed source.
      showToast(getString('globalSearch.noSourceForUrl'));
    }
    // Non-URL text: the debounced search is already running; enter does nothing extra.
  }, [openNovel, searchUrlResult]);

  const openNovelOffer =
    searchUrlResult?.kind === 'novel'
      ? {
          icon: 'book-open-page-variant',
          label: getString('globalSearch.openNovel'),
          onPress: handleSubmit,
        }
      : searchText === '' && clipboardNovel
      ? {
          icon: 'content-paste',
          label: getString('globalSearch.openCopiedNovel'),
          onPress: () => openNovel(clipboardNovel),
        }
      : null;

  return (
    <SafeAreaView>
      <SearchbarV2
        searchText={searchText}
        placeholder={getString('browseScreen.globalSearch')}
        leftIcon="magnify"
        onChangeText={onChangeText}
        onSubmitEditing={handleSubmit}
        clearSearchbar={clearSearchbar}
        theme={theme}
      />
      {progress ? (
        <ProgressBar
          color={theme.primary}
          progress={Math.round(1000 * progress) / 1000}
        />
      ) : null}
      <View style={styles.filterContainer}>
        <SelectableChip
          label={getString('globalSearch.hasResults')}
          selected={hasResultsOnly}
          icon="filter-variant"
          showCheckIcon={false}
          theme={theme}
          onPress={() => setHasResultsOnly(!hasResultsOnly)}
          mode="outlined"
        />
        <SelectableChip
          label={getString('globalSearch.pinnedOnly')}
          selected={globalSearchPinnedOnly}
          icon="pin-outline"
          showCheckIcon={false}
          theme={theme}
          onPress={() =>
            setBrowseSettings({
              globalSearchPinnedOnly: !globalSearchPinnedOnly,
            })
          }
          mode="outlined"
        />
        <SelectableChip
          label={getString('globalSearch.englishOnly')}
          selected={globalSearchEnglishOnly}
          icon="translate"
          showCheckIcon={false}
          theme={theme}
          onPress={() =>
            setBrowseSettings({
              globalSearchEnglishOnly: !globalSearchEnglishOnly,
            })
          }
          mode="outlined"
        />
      </View>
      <GlobalSearchResultsList
        searchResults={searchResults}
        ListEmptyComponent={
          <EmptyView
            icon="__φ(．．)"
            description={`${getString('globalSearch.searchIn')} ${getString(
              'globalSearch.allSources',
            )}`}
            theme={theme}
          />
        }
      />
      {openNovelOffer ? (
        <AnimatedFAB
          entering={SlideInRight.duration(250)}
          exiting={SlideOutRight.duration(250)}
          style={[
            styles.openNovelFabContainer,
            fabPositionStyle,
            { backgroundColor: theme.primary },
          ]}
          testID="open-novel-button"
          icon={openNovelOffer.icon}
          label={openNovelOffer.label}
          uppercase={false}
          color={theme.onPrimary}
          onPress={openNovelOffer.onPress}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default GlobalSearchScreen;

const styles = StyleSheet.create({
  openNovelFabContainer: {
    position: 'absolute',
    right: 0,
    bottom: 16,
    margin: 16,
  },
  filterContainer: {
    paddingHorizontal: 8,
    paddingTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
