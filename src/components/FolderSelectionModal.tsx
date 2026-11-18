import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../utils/theme';
import { NativeScaleButton } from './NativeScaleButton';
import { AnimatedCard } from '../utils/motion';
import { StorageDisclosureModal } from './StorageDisclosureModal';

interface FolderInfo {
  uri: string;
  name: string;
  volume: string;
}

interface FolderSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (selectedFolders: string[]) => void;
}

export function FolderSelectionModal({ visible, onClose, onSave }: FolderSelectionModalProps) {
  const COLORS = useThemeColors();
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);

  useEffect(() => {
    if (visible) {
      loadFolders();
    }
  }, [visible]);

  // Auto reload folders when returning to app from Android settings
  useEffect(() => {
    if (!visible) return;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        loadFolders();
      }
    });
    return () => subscription.remove();
  }, [visible]);

  const loadFolders = async () => {
    setIsLoading(true);
    
    try {
      // 3-second maximum timeout to guarantee UI never gets stuck
      await Promise.race([
        discoverFoldersInternal(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Folder discovery timed out')), 3500))
      ]);
    } catch (e) {
      console.warn('[FolderPicker] Folder discovery fallback:', e);
      // Fallback: Populate standard essential folders if discovery timed out
      setFolders(prev => prev.length > 0 ? prev : getStandardDefaultFolders());
    } finally {
      setIsLoading(false);
    }
  };

  const getStandardDefaultFolders = (): FolderInfo[] => [
    { uri: 'file:///storage/emulated/0/Download/', name: 'Download', volume: 'Internal Storage' },
    { uri: 'file:///storage/emulated/0/Documents/', name: 'Documents', volume: 'Internal Storage' },
    { uri: 'file:///storage/emulated/0/DCIM/', name: 'DCIM (Camera)', volume: 'Internal Storage' },
    { uri: 'file:///storage/emulated/0/Pictures/', name: 'Pictures', volume: 'Internal Storage' },
    { uri: 'file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/', name: 'WhatsApp Documents', volume: 'Internal Storage' },
  ];

  const handleBrowseSafFolder = async () => {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted && permissions.directoryUri) {
        const safUri = permissions.directoryUri;
        const rawName = decodeURIComponent(safUri.split('%2F').pop() || safUri.split(':').pop() || 'Selected Folder');
        const folderName = rawName.replace(/^primary:/i, '').replace(/^raw:/i, '') || 'Custom Folder';
        
        const customFolder: FolderInfo = {
          uri: safUri,
          name: `📁 ${folderName}`,
          volume: 'Custom Picked (SAF)',
        };

        setFolders(prev => [customFolder, ...prev.filter(f => f.uri !== safUri)]);
        setSelectedUris(prev => new Set([...prev, safUri]));
      }
    } catch (e) {
      console.warn('Failed to pick SAF folder:', e);
    }
  };

  const discoverFoldersInternal = async () => {
    const allFolders: FolderInfo[] = [];
    const seenUris = new Set<string>();
    const rootPath = 'file:///storage/emulated/0/';

    const addFolderSafe = (uri: string, name: string, volume = 'Internal Storage') => {
      if (!seenUris.has(uri)) {
        seenUris.add(uri);
        allFolders.push({ uri, name, volume });
      }
    };

    // 1. Probe WhatsApp media directory
    const waPath = `${rootPath}Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Documents/`;
    try {
      const info = await FileSystem.getInfoAsync(waPath);
      if (info.exists) {
        addFolderSafe(waPath, 'WhatsApp Documents');
      }
    } catch (e) {}

    // 2. Discover standard top-level device storage folders
    try {
      const dirItems = await FileSystem.readDirectoryAsync(rootPath);
      for (const item of dirItems) {
        if (item.startsWith('.')) continue;
        if (item === 'Android') continue;

        try {
          const itemPath = `${rootPath}${item}/`;
          const itemInfo = await FileSystem.getInfoAsync(itemPath);
          if (itemInfo.exists && itemInfo.isDirectory) {
            addFolderSafe(itemPath, item);
          }
        } catch (e) {
          // Skip unreadable item
        }
      }
    } catch (e) {
      console.warn('Could not read root storage directory:', e);
    }

    if (allFolders.length === 0) {
      allFolders.push(...getStandardDefaultFolders());
    }

    // Sort folders alphabetically
    allFolders.sort((a, b) => a.name.localeCompare(b.name));
    setFolders(allFolders);
  };

  const toggleSelection = (uri: string) => {
    const newSet = new Set(selectedUris);
    if (newSet.has(uri)) {
      newSet.delete(uri);
    } else {
      newSet.add(uri);
    }
    setSelectedUris(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedUris.size === folders.length && folders.length > 0) {
      setSelectedUris(new Set());
    } else {
      setSelectedUris(new Set(folders.map(f => f.uri)));
    }
  };

  const handleSave = () => {
    onSave(Array.from(selectedUris));
    onClose();
  };

  const handleGrantAccessPress = async () => {
    try {
      const accepted = await AsyncStorage.getItem('storage_disclosure_accepted');
      if (accepted === 'true') {
        launchAllFilesSettings();
      } else {
        setShowDisclosure(true);
      }
    } catch (e) {
      setShowDisclosure(true);
    }
  };

  const launchAllFilesSettings = () => {
    try {
      const IntentLauncher = require('expo-intent-launcher');
      IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', {
        data: `package:com.filelenspro.app`
      });
    } catch (e) {
      console.warn('Error launching settings:', e);
    }
  };

  const renderItem = ({ item, index }: { item: FolderInfo; index: number }) => {
    const isFirstInVolume = index === 0 || folders[index - 1].volume !== item.volume;
    const isSelected = selectedUris.has(item.uri);

    return (
      <View>
        {isFirstInVolume && (
          <View style={[styles.sectionHeader, { backgroundColor: COLORS.surface }]}>
            <Ionicons 
              name={item.volume.includes('SAF') ? 'folder-open-outline' : item.volume === 'Internal Storage' ? 'phone-portrait-outline' : 'hardware-chip-outline'} 
              size={18} 
              color={COLORS.text} 
              style={{ marginRight: 8 }} 
            />
            <Text style={[styles.sectionHeaderText, { color: COLORS.text }]}>{item.volume}</Text>
          </View>
        )}
        <NativeScaleButton 
          style={[styles.itemRow, { borderBottomColor: COLORS.border }]} 
          onPress={() => toggleSelection(item.uri)}
          activeScale={0.97}
        >
          <View style={styles.itemInfo}>
            <Ionicons 
              name={item.name.toLowerCase().includes('whatsapp') ? 'logo-whatsapp' : 'folder-outline'} 
              size={24} 
              color={item.name.toLowerCase().includes('whatsapp') ? '#25D366' : COLORS.accent} 
              style={{ marginRight: 12 }} 
            />
            <Text style={[styles.itemText, { color: COLORS.text }]}>{item.name}</Text>
          </View>
          <Ionicons 
            name={isSelected ? "checkbox" : "square-outline"} 
            size={24} 
            color={isSelected ? COLORS.accent : COLORS.muted} 
          />
        </NativeScaleButton>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: COLORS.border, backgroundColor: COLORS.surface }]}>
          <NativeScaleButton onPress={onClose} style={styles.headerBtn} activeScale={0.92}>
            <Text style={{ color: COLORS.accent, fontSize: 16 }}>Cancel</Text>
          </NativeScaleButton>
          <Text style={[styles.headerTitle, { color: COLORS.text }]}>Select Folders</Text>
          <NativeScaleButton onPress={handleSave} style={styles.headerBtn} activeScale={0.92} hapticType="medium">
            <Text style={{ color: COLORS.accent, fontSize: 16, fontWeight: 'bold' }}>
              Save ({selectedUris.size})
            </Text>
          </NativeScaleButton>
        </View>

        {/* Select All Toggle Bar */}
        {folders.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
            <NativeScaleButton onPress={toggleSelectAll} style={{ flexDirection: 'row', alignItems: 'center' }} activeScale={0.96}>
              <Ionicons 
                name={selectedUris.size === folders.length ? "checkbox" : "square-outline"} 
                size={20} 
                color={COLORS.accent} 
                style={{ marginRight: 6 }} 
              />
              <Text style={{ color: COLORS.accent, fontWeight: '600', fontSize: 14 }}>
                {selectedUris.size === folders.length ? 'Deselect All' : 'Select All Folders'}
              </Text>
            </NativeScaleButton>
            <Text style={{ color: COLORS.muted, fontSize: 13 }}>
              {selectedUris.size} of {folders.length} selected
            </Text>
          </View>
        )}

        {/* Action Buttons: SAF Picker & Storage Access Banner */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {Platform.OS === 'android' && (
            <NativeScaleButton 
              style={[styles.safBtnCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
              onPress={handleBrowseSafFolder}
              activeScale={0.97}
            >
              <View style={[styles.safIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="folder-open" size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.bannerTitle, { color: COLORS.text }]}>Browse System File Picker</Text>
                <Text style={[styles.bannerDesc, { color: COLORS.muted }]}>
                  Pick any custom Telegram, SD card, or Downloads folder directly.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
            </NativeScaleButton>
          )}

          {/* Prominent Storage Access Banner */}
          {Platform.OS === 'android' && (
            <NativeScaleButton 
              style={[styles.bannerCard, { backgroundColor: COLORS.surface, borderColor: COLORS.accent }]}
              onPress={handleGrantAccessPress}
              activeScale={0.97}
            >
              <View style={[styles.bannerIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.bannerTitle, { color: COLORS.text }]}>Unlock All Device Folders</Text>
                <Text style={[styles.bannerDesc, { color: COLORS.muted }]}>
                  Enable full file access in Android settings for system directories.
                </Text>
              </View>
              <View style={[styles.bannerBadge, { backgroundColor: COLORS.accent }]}>
                <Text style={styles.bannerBadgeText}>Enable</Text>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </View>
            </NativeScaleButton>
          )}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={{ color: COLORS.muted, marginTop: 12 }}>Discovering folders...</Text>
          </View>
        ) : (
          <FlatList
            data={folders}
            keyExtractor={item => item.uri}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* In-App Prominent Disclosure Modal */}
        <StorageDisclosureModal
          visible={showDisclosure}
          onAgree={async () => {
            setShowDisclosure(false);
            await AsyncStorage.setItem('storage_disclosure_accepted', 'true');
            launchAllFilesSettings();
          }}
          onCancel={() => {
            setShowDisclosure(false);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerBtn: {
    minWidth: 60,
  },
  safBtnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  safIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 2,
  },
  bannerBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  itemText: {
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
