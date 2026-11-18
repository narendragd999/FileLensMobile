import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSavedSearches, deleteSavedSearch, clearAllSavedSearches, SavedSearch } from '../services/bookmarksService';
import { useThemeColors, SIZES } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useStore } from '../store/useStore';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { HeaderMenuButton } from '../components/QuickNavModal';

export default function SavedSearchesScreen() {
  const COLORS = useThemeColors();
  const styles = React.useMemo(() => getStyles(COLORS), [COLORS]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const router = useRouter();
  const { setSearchQuery, setSearchMode } = useStore();
  const insets = useSafeAreaInsets();

  // Themed Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    icon?: any;
    iconColor?: string;
    buttons?: AlertButton[];
  }>({
    visible: false,
    title: '',
  });

  const showAlert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: { icon?: any; iconColor?: string }
  ) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      buttons: buttons || [
        {
          text: 'OK',
          style: 'default',
          onPress: () => setAlertConfig(c => ({ ...c, visible: false })),
        },
      ],
      icon: options?.icon,
      iconColor: options?.iconColor,
    });
  };

  const hideAlert = () => {
    setAlertConfig(c => ({ ...c, visible: false }));
  };

  useFocusEffect(
    useCallback(() => {
      loadSearches();
    }, [])
  );

  const loadSearches = async () => {
    try {
      const saved = await getSavedSearches();
      setSearches(saved);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunSearch = (item: SavedSearch) => {
    setSearchQuery(item.query);
    if (item.mode) {
      setSearchMode(item.mode as any);
    }
    router.navigate({
      pathname: '/',
      params: {
        q: item.query,
        mode: item.mode || 'partial',
        t: String(Date.now()),
      },
    });
  };

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'similar': return '🧠 Natural Language';
      case 'exact': return '🎯 Exact Match';
      case 'whole_word': return '🔤 Whole Word';
      case 'partial':
      default: return '⚡ Quick Search';
    }
  };

  const handleDelete = (id: number) => {
    showAlert(
      'Delete Saved Search',
      'Are you sure you want to remove this saved search?',
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            await deleteSavedSearch(id);
            loadSearches();
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  const handleClearAll = () => {
    showAlert(
      'Clear All Searches',
      'Are you sure you want to delete all saved searches? This cannot be undone.',
      [
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            await clearAllSavedSearches();
            loadSearches();
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
      { icon: 'trash', iconColor: COLORS.danger }
    );
  };

  const renderItem = ({ item }: { item: SavedSearch }) => (
    <TouchableOpacity 
      style={styles.searchRow}
      onPress={() => handleRunSearch(item)}
      activeOpacity={0.7}
    >
      <View style={styles.searchInfo}>
        <Text style={styles.searchName}>{item.name}</Text>
        <Text style={styles.searchQuery}>Query: "{item.query}" • {getModeLabel(item.mode)}</Text>
        <Text style={styles.searchDate}>Saved on: {new Date(item.created).toLocaleDateString()}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ padding: 4 }}>
          <Ionicons name="arrow-forward-circle-outline" size={26} color={COLORS.accent} />
        </View>
        <TouchableOpacity 
          style={styles.deleteBtn} 
          onPress={(e) => {
            e.stopPropagation();
            handleDelete(item.id!);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.brandHeader}>
        <View style={styles.headerTitleRow}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.navigate('/');
            }}
            style={{ padding: 4, marginRight: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Ionicons name="search-circle" size={30} color={COLORS.accent} />
          <Text style={[styles.brandTitle, { flexShrink: 1 }]} numberOfLines={1}>Saved Searches</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {searches.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
              <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 13 }}>Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={loadSearches} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={18} color={COLORS.accent} />
          </TouchableOpacity>
          <HeaderMenuButton />
        </View>
      </View>
      
      {searches.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.ctaIconWrap}>
            <Ionicons name="bookmark" size={48} color={COLORS.muted} />
          </View>
          <Text style={styles.emptyText}>No saved searches</Text>
          <Text style={styles.emptySubText}>Run a search on the home screen and tap the bookmark icon to save it for quick access.</Text>
        </View>
      ) : (
        <FlatList
          data={searches}
          keyExtractor={(item) => item.id!.toString()}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 24) + 50 }]}
        />
      )}

      {/* Themed Alert Modal */}
      <ThemedAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        icon={alertConfig.icon}
        iconColor={alertConfig.iconColor}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
    </View>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  brandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  list: { padding: SIZES.padding },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.surface2,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInfo: { flex: 1 },
  searchName: { fontSize: 16, color: COLORS.text, fontWeight: '700', marginBottom: 6 },
  searchQuery: { fontSize: 14, color: COLORS.muted, marginBottom: 4 },
  searchDate: { fontSize: 12, color: COLORS.dim },
  deleteBtn: {
    padding: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    marginLeft: 12,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  ctaIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyText: { fontSize: 20, color: COLORS.text, fontWeight: '700', marginBottom: 8 },
  emptySubText: { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 22 },
});
