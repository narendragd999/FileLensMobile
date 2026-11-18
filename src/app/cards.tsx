import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput, Modal, ActivityIndicator, ScrollView, AppState } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getDatabase, deleteFileById, updateCardTag } from '../services/database';
import { useThemeColors } from '../utils/theme';
// PIN security removed per user request
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { SafePdfView } from '../components/SafePdfView';
import { exportContent, ExportFormat } from '../services/exportService';
import { buildPdfFromImages } from 'expo-pdf-to-image';
import { getAiConfig, acceptAiAgreement, structureOcrText } from '../services/aiService';
import { ExportModal } from '../components/ExportModal';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { ImageCropModal } from '../components/ImageCropModal';
import { NativeScaleButton } from '../components/NativeScaleButton';
import { FileThumbnail } from '../components/FileThumbnail';
import { HeaderMenuButton } from '../components/QuickNavModal';
import Animated, { FadeIn, FadeOut, FadeInDown, FadeOutDown, SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated';
import { cardLayoutTransition, getStaggerDelay, MotionTiming } from '../utils/motion';
import { Haptics } from '../utils/haptics';
import {
  SMART_CATEGORIES,
  getCardSmartCategory,
  findRelatedCards,
  detectCardExpiry,
  RelatedCardMatch,
} from '../services/semanticExtensionsService';

const CARD_CATEGORIES = [
  'All',
  '📁 Smart Folders',
  '🏥 Medical',
  '🚗 Vehicle',
  '🧾 Finance',
  '🆔 IDs & KYC',
  '🎓 Education',
  '📝 Personal',
  '💼 Business',
  '🎟️ Passes',
  '🧾 Receipts',
];

interface CardItem {
  id: number;
  uri: string;
  name: string;
  custom_tag: string;
  ocr_text: string;
  modified: string;
}

export default function CardsScreen() {
  const COLORS = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ idCardSaved?: string; hasBack?: string }>();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSmartFolder, setSelectedSmartFolder] = useState<string | null>(null);

  // Scan / Add modal state
  const [showScanChoiceModal, setShowScanChoiceModal] = useState<boolean>(false);
  const [showIdGuideModal, setShowIdGuideModal] = useState<boolean>(false);

  // View mode (default List view)
  const [isGridView, setIsGridView] = useState(false);
  
  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<CardItem | null>(null);
  const [previewMode, setPreviewMode] = useState<'original' | 'text'>('original');
  const [relatedCards, setRelatedCards] = useState<RelatedCardMatch[]>([]);

  useEffect(() => {
    if (previewItem) {
      findRelatedCards(previewItem, cards, 3, 0.35)
        .then(res => setRelatedCards(res))
        .catch(() => setRelatedCards([]));
    } else {
      setRelatedCards([]);
    }
  }, [previewItem, cards]);

  // ----------------------------------------------------
  // PIN Vault State & Modals
  // ----------------------------------------------------
// PIN states removed

  const smartFolderStats = useMemo(() => {
    const stats: Record<string, number> = {
      medical: 0,
      vehicle: 0,
      finance: 0,
      govt_id: 0,
      education: 0,
      personal: 0,
    };
    for (const c of cards) {
      const catId = getCardSmartCategory(c);
      if (stats[catId] !== undefined) {
        stats[catId]++;
      }
    }
    return stats;
  }, [cards]);

  // Edit Tag Modal State
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [editTagInput, setEditTagInput] = useState('');

  // Export Modal State
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportContentText, setExportContentText] = useState('');
  const [exportFileName, setExportFileName] = useState('');
  const [exportImageUri, setExportImageUri] = useState<string | null>(null);

  // Image Crop & Border Align State
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [cropTargetImage, setCropTargetImage] = useState<{ uri: string; name: string } | null>(null);

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

  const fetchCards = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<CardItem>(
        'SELECT id, uri, name, custom_tag, ocr_text, modified FROM files WHERE is_card = 1 OR is_card > 0 ORDER BY id DESC'
      );
      setCards(rows || []);
    } catch (err) {
      console.warn('Failed to fetch cards:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCards();
    }, [fetchCards])
  );

    useEffect(() => {
    if (params.idCardSaved === 'true') {
      router.setParams({ idCardSaved: undefined } as any);
      showAlert(
        '2-in-1 ID Card Saved',
        params.hasBack === 'true'
          ? 'Front & Back have been successfully composited onto 1 single A4 PDF page with official KYC borders.'
          : 'Your ID card has been formatted onto a single A4 PDF page in your card vault.',
        [{ text: 'Great', style: 'default', onPress: hideAlert }],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    }
  }, [params.idCardSaved, params.hasBack]);

  const filteredCards = useMemo(() => {
    let list = cards;
    if (selectedCategory === '📁 Smart Folders') {
      if (selectedSmartFolder) {
        list = list.filter(c => getCardSmartCategory(c) === selectedSmartFolder);
      } else {
        list = [];
      }
    } else if (selectedCategory !== 'All') {
      list = list.filter(c => {
        const tag = (c.custom_tag || '').toLowerCase();
        const ocr = (c.ocr_text || '').toLowerCase();
        const name = (c.name || '').toLowerCase();
        const smartCat = getCardSmartCategory(c);

        if (selectedCategory.includes('IDs')) {
          return (
            smartCat === 'govt_id' ||
            tag.includes('id') ||
            tag.includes('aadhaar') ||
            tag.includes('pan') ||
            tag.includes('passport') ||
            tag.includes('license') ||
            tag.includes('voter') ||
            tag.includes('kyc') ||
            ocr.includes('identity') ||
            ocr.includes('republic of india') ||
            ocr.includes('income tax') ||
            ocr.includes('driving') ||
            name.includes('id')
          );
        } else if (selectedCategory.includes('Education')) {
          return smartCat === 'education';
        } else if (selectedCategory.includes('Medical')) {
          return smartCat === 'medical';
        } else if (selectedCategory.includes('Vehicle')) {
          return smartCat === 'vehicle';
        } else if (selectedCategory.includes('Finance')) {
          return smartCat === 'finance' || tag.includes('bill') || tag.includes('receipt') || tag.includes('invoice');
        } else if (selectedCategory.includes('Personal')) {
          return smartCat === 'personal';
        } else if (selectedCategory.includes('Business')) {
          return (
            tag.includes('business') ||
            tag.includes('visiting') ||
            tag.includes('company') ||
            tag.includes('work') ||
            ocr.includes('director') ||
            ocr.includes('manager') ||
            ocr.includes('company') ||
            ocr.includes('pvt') ||
            ocr.includes('ltd') ||
            ocr.includes('phone:') ||
            ocr.includes('email:')
          );
        } else if (selectedCategory.includes('Passes')) {
          return (
            tag.includes('pass') ||
            tag.includes('ticket') ||
            tag.includes('membership') ||
            tag.includes('boarding') ||
            tag.includes('entry') ||
            ocr.includes('gate') ||
            ocr.includes('ticket') ||
            ocr.includes('seat')
          );
        } else if (selectedCategory.includes('Receipts')) {
          return (
            tag.includes('receipt') ||
            tag.includes('bill') ||
            tag.includes('invoice') ||
            tag.includes('tax') ||
            tag.includes('payment') ||
            ocr.includes('total') ||
            ocr.includes('gst') ||
            ocr.includes('amount') ||
            ocr.includes('subtotal')
          );
        }
        return tag.includes(selectedCategory.toLowerCase());
      });
    }

    if (!searchQuery.trim()) return list;
    const lowerQ = searchQuery.toLowerCase();
    return list.filter(c => 
      (c.custom_tag || '').toLowerCase().includes(lowerQ) ||
      (c.ocr_text || '').toLowerCase().includes(lowerQ) ||
      (c.name || '').toLowerCase().includes(lowerQ)
    );
  }, [cards, selectedCategory, selectedSmartFolder, searchQuery]);

  // Light Gallery: Current Card Index in Cards
  const currentCardIndex = useMemo(() => {
    if (!previewItem || filteredCards.length === 0) return -1;
    return filteredCards.findIndex(c => c.id === previewItem.id);
  }, [previewItem, filteredCards]);

  const handleNavigateCard = useCallback((direction: -1 | 1) => {
    if (currentCardIndex === -1 || filteredCards.length === 0) return;
    const newIndex = currentCardIndex + direction;
    if (newIndex >= 0 && newIndex < filteredCards.length) {
      setPreviewItem(filteredCards[newIndex]);
    }
  }, [currentCardIndex, filteredCards]);

  const handleScanId2In1 = () => {
    setShowScanChoiceModal(false);
    setShowIdGuideModal(true);
  };

  const handleImportGallery = async () => {
    setShowScanChoiceModal(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert(
        'Permission Needed',
        'Gallery permission is required to import a card image.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'images-outline', iconColor: COLORS.warning }
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const safeFileName = `imported_card_${Date.now()}.jpg`;
      const localUri = `${FileSystem.documentDirectory}${safeFileName}`;
      try {
        await FileSystem.copyAsync({ from: asset.uri, to: localUri });
        router.push(`/create-card?fileUri=${encodeURIComponent(localUri)}`);
      } catch (err) {
        console.warn('Error saving imported card photo:', err);
      }
    }
  };

  const handleImportFile = async () => {
    setShowScanChoiceModal(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const isPdf = (asset.name || '').toLowerCase().endsWith('.pdf') || (asset.mimeType || '').includes('pdf');
        const ext = isPdf ? '.pdf' : '.jpg';
        const safeFileName = `imported_card_${Date.now()}${ext}`;
        const localUri = `${FileSystem.documentDirectory}${safeFileName}`;
        await FileSystem.copyAsync({ from: asset.uri, to: localUri });
        router.push(`/create-card?fileUri=${encodeURIComponent(localUri)}&fileName=${encodeURIComponent(asset.name || safeFileName)}`);
      }
    } catch (err: any) {
      console.warn('Error importing file for card:', err);
    }
  };

  const handleScanCard = () => {
    setShowScanChoiceModal(false);
    // Launches Camera Scanner (Google Docs Document Scanner) with auto edge detection and perspective crop
    router.push({ pathname: '/doc-scanner', params: { initialMode: 'single', returnToCard: 'true', t: Date.now() } } as any);
  };

  const handleExportCard = (item: CardItem) => {
    const text = [item.custom_tag ? `[Tag: ${item.custom_tag}]` : null, item.ocr_text].filter(Boolean).join('\n\n');
    if (!text || !text.trim()) {
      showAlert(
        'No Content',
        'This card has no extracted text to export.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.warning }
      );
      return;
    }

    setExportContentText(text);
    setExportFileName(item.name);
    
    // Cards are images (jpg/png) by definition since they come from the scanner or image picker
    setExportImageUri(item.uri);
    
    setExportModalVisible(true);
  };

  const handleOpenOrganizer = async (item: CardItem) => {
    try {
      const rawUri = item.uri || '';
      const formattedUri = rawUri.startsWith('file://') || rawUri.startsWith('content://') || rawUri.startsWith('http')
        ? rawUri
        : `file://${rawUri}`;
      const isPdf = rawUri.toLowerCase().endsWith('.pdf') || (item.name || '').toLowerCase().endsWith('.pdf');

      setPreviewItem(null);
      if (isPdf) {
        router.push(`/page-organizer?pdfUri=${encodeURIComponent(formattedUri)}&fileName=${encodeURIComponent(item.name || 'card.pdf')}`);
      } else {
        const res = await buildPdfFromImages([formattedUri], undefined, item.name || 'Card Document');
        if (res?.pdfUri) {
          router.push(`/page-organizer?pdfUri=${encodeURIComponent(res.pdfUri)}&fileName=${encodeURIComponent((item.name || 'card') + '.pdf')}`);
        } else {
          showAlert('Organizer', 'Could not prepare PDF for organizer.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
        }
      }
    } catch (err) {
      console.warn('Failed to launch organizer from card:', err);
      showAlert('Organizer', 'Could not open page organizer for this card.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }
  };

  const handleDeleteCard = (item: CardItem) => {
    showAlert(
      'Delete Card',
      `Are you sure you want to delete "${item.custom_tag || item.name}"?`,
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            try {
              await deleteFileById(item.id);
              try {
                await FileSystem.deleteAsync(item.uri, { idempotent: true });
              } catch (fsErr) {
                // Ignore FS error if file is missing
              }
              if (previewItem?.id === item.id) {
                setPreviewItem(null);
              }
              fetchCards();
            } catch (err) {
              showAlert('Error', 'Failed to delete card.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
            }
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  const handleCopyText = async (item: CardItem) => {
    const textToCopy = [item.custom_tag ? `[Tag: ${item.custom_tag}]` : null, item.ocr_text].filter(Boolean).join('\n\n');
    if (!textToCopy) {
      showAlert('No Text', 'There is no text available to copy.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
      return;
    }
    try {
      await Clipboard.setStringAsync(textToCopy);
      showAlert(
        'Copied',
        'Card text copied to clipboard!',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'checkmark-circle', iconColor: COLORS.success }
      );
    } catch (e) {
      showAlert('Error', 'Failed to copy text.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }
  };

  const handleShareDirect = async (item: CardItem) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        let shareUri = item.uri;
        if (shareUri.startsWith('content://') || shareUri.startsWith('file:///storage/')) {
          const filename = shareUri.split('/').pop() || `share_${Date.now()}`;
          const cacheUri = FileSystem.cacheDirectory + filename;
          await FileSystem.copyAsync({ from: shareUri, to: cacheUri });
          shareUri = cacheUri;
        }
        await Sharing.shareAsync(shareUri);
      } else {
        showAlert('Not Available', 'Native sharing is not available on this device', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
      }
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const handleShare = async (item: CardItem) => {
    const isImage = !item.uri.toLowerCase().endsWith('.pdf');

    if (isImage) {
      showAlert(
        'Share Card',
        `How would you like to share "${item.name}"?`,
        [
          {
            text: '✂️ Crop & Align Borders',
            style: 'default',
            onPress: () => {
              hideAlert();
              setCropTargetImage({ uri: item.uri, name: item.name });
              setCropModalVisible(true);
            },
          },
          {
            text: '⚡ Share Original',
            style: 'default',
            onPress: () => {
              hideAlert();
              handleShareDirect(item);
            },
          },
          { text: 'Cancel', style: 'cancel', onPress: hideAlert },
        ],
        { icon: 'share-social', iconColor: COLORS.accent }
      );
    } else {
      handleShareDirect(item);
    }
  };

  const saveEditedTag = async () => {
    if (!editingCard) return;
    if (!editTagInput.trim()) {
      showAlert(
        'Tag Required',
        'Custom Tag is a required field. Please enter a tag name.',
        [{ text: 'OK', style: 'default', onPress: hideAlert }],
        { icon: 'alert-circle', iconColor: COLORS.danger }
      );
      return;
    }
    try {
      await updateCardTag(editingCard.id, editTagInput.trim());
      setEditingCard(null);
      fetchCards();
    } catch (err) {
      showAlert('Error', 'Failed to update tag.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }
  };

  const renderItem = ({ item, index }: { item: CardItem; index: number }) => {
    const rawUri = item.uri || '';
    const formattedUri = rawUri.startsWith('file://') || rawUri.startsWith('content://') || rawUri.startsWith('http')
      ? rawUri
      : `file://${rawUri}`;
    const isPdf = rawUri.toLowerCase().endsWith('.pdf') || (item.name || '').toLowerCase().endsWith('.pdf');
    const expiry = detectCardExpiry(item);

    if (isGridView) {
      return (
        <Animated.View
          entering={FadeInDown.delay(getStaggerDelay(index)).springify().damping(18).stiffness(240)}
          layout={cardLayoutTransition}
          style={{ flex: 1, marginHorizontal: 4, marginBottom: 12 }}
        >
          <View style={[styles.gridCardContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => {
                setPreviewItem(item);
                setPreviewMode('original');
              }}
              activeOpacity={0.7}
            >
              <FileThumbnail
                uri={formattedUri}
                name={item.name}
                style={styles.cardImage}
                imageStyle={{ borderRadius: 8, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                accentColor={COLORS.accent}
                placeholderBg={COLORS.surface2}
                iconSize={32}
                badgeText={isPdf ? 'PDF' : undefined}
              />
              <View style={styles.cardInfo}>
                {item.custom_tag ? (
                  <View style={[styles.tagBadge, { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent + '40', borderWidth: 0.5 }]}>
                    <Text style={[styles.tagText, { color: COLORS.accent }]}>{item.custom_tag}</Text>
                  </View>
                ) : null}
                {expiry.hasExpiry && (expiry.status === 'expired' || expiry.status === 'expiring_soon') ? (
                  <View style={[styles.expiryBadge, { backgroundColor: (expiry.badgeColor || '#F59E0B') + '20', borderColor: expiry.badgeColor || '#F59E0B', marginBottom: 4 }]}>
                    <Ionicons name={expiry.status === 'expired' ? 'alert-circle' : 'time-outline'} size={11} color={expiry.badgeColor || '#F59E0B'} />
                    <Text style={[styles.expiryBadgeText, { color: expiry.badgeColor || '#F59E0B' }]}>{expiry.badgeLabel}</Text>
                  </View>
                ) : null}
                <Text style={[styles.cardName, { color: COLORS.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.ocrSnippet, { color: COLORS.muted }]} numberOfLines={2}>
                  {item.ocr_text || 'No text recognized.'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.cardActionsGrid, { borderColor: COLORS.border }]}>
              <TouchableOpacity style={styles.actionBtnGrid} onPress={() => handleCopyText(item)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Ionicons name="copy-outline" size={16} color={COLORS.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnGrid} onPress={() => handleShare(item)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Ionicons name="share-outline" size={16} color={COLORS.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnGrid} onPress={() => { setEditTagInput(item.custom_tag || ''); setEditingCard(item); }} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Ionicons name="pencil-outline" size={16} color={COLORS.accent} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtnGrid} onPress={() => handleDeleteCard(item)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      );
    }

    // Compact Minimal List View Item
    return (
      <Animated.View
        entering={FadeInDown.delay(getStaggerDelay(index)).springify().damping(18).stiffness(240)}
        layout={cardLayoutTransition}
        style={{ width: '100%', marginBottom: 10 }}
      >
        <View style={[styles.compactCardContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          {/* Tappable Card Body (Opens Preview) */}
          <TouchableOpacity
            style={styles.compactCardBody}
            onPress={() => {
              setPreviewItem(item);
              setPreviewMode('original');
            }}
            activeOpacity={0.7}
          >
            <FileThumbnail
              uri={formattedUri}
              name={item.name}
              style={styles.compactThumb}
              imageStyle={{ borderRadius: 8 }}
              accentColor={COLORS.accent}
              placeholderBg={COLORS.surface2}
              iconSize={24}
              badgeText={isPdf ? 'PDF' : undefined}
            />
            <View style={styles.compactInfo}>
              <View style={styles.compactHeaderRow}>
                <Text style={[styles.compactTitle, { color: COLORS.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.custom_tag ? (
                  <View style={[styles.compactTagBadge, { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent + '40' }]}>
                    <Text style={[styles.compactTagText, { color: COLORS.accent }]}>{item.custom_tag}</Text>
                  </View>
                ) : null}
                {expiry.hasExpiry && (expiry.status === 'expired' || expiry.status === 'expiring_soon') ? (
                  <View style={[styles.expiryBadge, { backgroundColor: (expiry.badgeColor || '#F59E0B') + '20', borderColor: expiry.badgeColor || '#F59E0B' }]}>
                    <Ionicons name={expiry.status === 'expired' ? 'alert-circle' : 'time-outline'} size={11} color={expiry.badgeColor || '#F59E0B'} />
                    <Text style={[styles.expiryBadgeText, { color: expiry.badgeColor || '#F59E0B' }]}>{expiry.badgeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.compactSnippet, { color: COLORS.muted }]} numberOfLines={2}>
                {item.ocr_text || 'No text recognized.'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Dedicated Clickable Action Bar (Never clashes with card body) */}
          <View style={[styles.compactActionBar, { borderTopColor: COLORS.border }]}>
            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => handleCopyText(item)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons name="copy-outline" size={15} color={COLORS.muted} />
              <Text style={[styles.compactActionLabel, { color: COLORS.muted }]}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => handleShare(item)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons name="share-outline" size={15} color={COLORS.muted} />
              <Text style={[styles.compactActionLabel, { color: COLORS.muted }]}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => { setEditTagInput(item.custom_tag || ''); setEditingCard(item); }}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons name="pencil-outline" size={15} color={COLORS.accent} />
              <Text style={[styles.compactActionLabel, { color: COLORS.accent }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => handleDeleteCard(item)}
              activeOpacity={0.6}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
              <Text style={[styles.compactActionLabel, { color: COLORS.danger }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  // ----------------------------------------------------
  // Vault Lock Screen (Shown when PIN is enabled & locked)
  // ----------------------------------------------------
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>Smart Card Wallet</Text>
          <Text style={[styles.headerSubtitle, { color: COLORS.muted }]} numberOfLines={1}>
            Instant OCR • On-Device Vault • 1-Tap Copy
          </Text>
        </View>
        <View style={styles.headerRightActions}>
          <TouchableOpacity 
            onPress={() => setIsGridView(!isGridView)} 
            style={[styles.headerGridToggleBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name={isGridView ? "list" : "grid"} size={18} color={COLORS.accent} />
          </TouchableOpacity>
          <HeaderMenuButton />
        </View>
      </View>

      {/* Feature Hero Banner - Compact */}
      <View style={[styles.heroBanner, { backgroundColor: COLORS.surface, borderColor: COLORS.border, padding: 10, marginTop: 8, marginHorizontal: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.heroIconCircle, { backgroundColor: COLORS.accent + '20', width: 34, height: 34, borderRadius: 17 }]}>
            <Ionicons name="wallet" size={18} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.heroBannerTitle, { color: COLORS.text, fontSize: 14 }]}>ID & Card Wallet</Text>
              <View
                style={[
                  styles.badgePrivate,
                  { backgroundColor: '#10B98120' },
                ]}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={10}
                  color="#10B981"
                />
                <Text style={[styles.badgePrivateText, { color: "#10B981" }]}>
                  100% On-Device
                </Text>
              </View>
            </View>
            <Text style={[styles.heroBannerSubtitle, { color: COLORS.muted, fontSize: 11, marginTop: 1 }]} numberOfLines={1}>
              Capture IDs, cards & passes with offline on-device processing.
            </Text>
          </View>
        </View>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
        <Ionicons name="search" size={18} color={COLORS.muted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: COLORS.text }]}
          placeholder="Search card text, numbers, or tags..."
          placeholderTextColor={COLORS.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <Ionicons name="close-circle" size={18} color={COLORS.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filter Chips */}
      <View style={styles.categoryScrollContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CARD_CATEGORIES.map(cat => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => {
                  setSelectedCategory(cat);
                  setSelectedSmartFolder(null);
                }}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isSelected ? COLORS.accent : COLORS.surface,
                    borderColor: isSelected ? COLORS.accent : COLORS.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    {
                      color: isSelected ? '#FFFFFF' : COLORS.text,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={{ color: COLORS.muted, marginTop: 10 }}>Loading card vault...</Text>
        </View>
      ) : selectedCategory === '📁 Smart Folders' && !selectedSmartFolder ? (
        <ScrollView contentContainerStyle={styles.smartFoldersContainer}>
          <View style={styles.smartFoldersHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={17} color={COLORS.accent} />
              <Text style={[styles.smartFoldersHeaderText, { color: COLORS.text }]}>
                AI Smart Dynamic Folders
              </Text>
            </View>
            <Text style={[styles.smartFoldersHeaderSub, { color: COLORS.muted }]}>
              Organized automatically by semantic meaning with on-device MiniLM
            </Text>
          </View>

          <View style={styles.smartFoldersGrid}>
            {SMART_CATEGORIES.map(cat => {
              const count = smartFolderStats[cat.id] || 0;

              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.smartFolderCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                  onPress={() => {
                    Haptics.light();
                    setSelectedSmartFolder(cat.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.smartFolderIconCircle, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={cat.icon as any} size={22} color={cat.color} />
                  </View>
                  <Text style={[styles.smartFolderTitle, { color: COLORS.text }]} numberOfLines={1}>
                    {cat.label}
                  </Text>
                  <Text style={[styles.smartFolderHindi, { color: COLORS.muted }]}>
                    {cat.hindi}
                  </Text>
                  <View style={[styles.smartFolderCountBadge, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
                    <Text style={[styles.smartFolderCountText, { color: COLORS.text }]}>
                      {count} {count === 1 ? 'card' : 'cards'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <>
          {selectedCategory === '📁 Smart Folders' && selectedSmartFolder && (
            <View style={[styles.smartFolderActiveBar, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
              <TouchableOpacity
                style={styles.smartFolderBackBtn}
                onPress={() => setSelectedSmartFolder(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={18} color={COLORS.accent} />
                <Text style={[styles.smartFolderBackText, { color: COLORS.accent }]}>Folders</Text>
              </TouchableOpacity>
              <View style={styles.smartFolderActiveInfo}>
                <Text style={[styles.smartFolderActiveTitle, { color: COLORS.text }]} numberOfLines={1}>
                  {SMART_CATEGORIES.find(c => c.id === selectedSmartFolder)?.label || 'Smart Folder'}
                </Text>
                <Text style={[styles.smartFolderActiveCount, { color: COLORS.muted }]}>
                  {filteredCards.length} {filteredCards.length === 1 ? 'card' : 'cards'}
                </Text>
              </View>
            </View>
          )}

          {filteredCards.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: COLORS.surface2 }]}>
                <Ionicons name="card-outline" size={44} color={COLORS.accent} />
              </View>
              <Text style={[styles.emptyText, { color: COLORS.text }]}>
                {selectedCategory === '📁 Smart Folders' && selectedSmartFolder
                  ? `No cards in ${SMART_CATEGORIES.find(c => c.id === selectedSmartFolder)?.label || 'this folder'}.`
                  : searchQuery || selectedCategory !== 'All'
                  ? 'No cards found matching your filter.'
                  : 'Your Wallet is Empty'}
              </Text>
              <Text style={[styles.emptySubtext, { color: COLORS.muted }]}>
                {searchQuery || selectedCategory !== 'All'
                  ? 'Try picking a different category chip or clearing search.'
                  : 'Scan driver licenses, IDs, business cards, or passes for instant number extraction and on-device storage.'}
              </Text>
              <TouchableOpacity
                style={[styles.emptyScanBtn, { backgroundColor: COLORS.accent }]}
                onPress={() => setShowScanChoiceModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.emptyScanBtnText}>Scan First Card</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              key={isGridView ? 'grid' : 'list'}
              data={filteredCards}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 24) + 84 }]}
              numColumns={isGridView ? 2 : 1}
              columnWrapperStyle={isGridView ? { justifyContent: 'space-between' } : undefined}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={11}
              removeClippedSubviews={false}
              updateCellsBatchingPeriod={30}
            />
          )}
        </>
      )}

      <NativeScaleButton 
        style={[styles.fab, { backgroundColor: COLORS.accent, bottom: 20 + Math.max(insets.bottom, 20) }]} 
        onPress={() => setShowScanChoiceModal(true)}
        activeScale={0.9}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </NativeScaleButton>

      {/* Edit Tag Modal */}
      <Modal visible={!!editingCard} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View 
            entering={ZoomIn.duration(200)}
            style={[styles.editModalContent, { backgroundColor: COLORS.surface }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 6 }}>
              <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: 'bold' }}>Edit Card Tag</Text>
              <Text style={{ color: COLORS.danger, fontSize: 13, fontWeight: 'bold' }}>* Required</Text>
            </View>

            {/* Quick Suggestions */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {['ID & KYC', 'Business Card', 'Member Pass', 'Receipt', 'Driver License'].map(sug => (
                <TouchableOpacity
                  key={sug}
                  onPress={() => setEditTagInput(sug)}
                  style={[
                    styles.tagSuggestionChip,
                    { backgroundColor: COLORS.surface2, borderColor: COLORS.border }
                  ]}
                >
                  <Text style={[styles.tagSuggestionText, { color: COLORS.text }]}>+{sug}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={{
                backgroundColor: COLORS.bg,
                color: COLORS.text,
                borderRadius: 8,
                padding: 12,
                fontSize: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
              value={editTagInput}
              onChangeText={setEditTagInput}
              placeholder="e.g. Receipt, ID Card, Invoice..."
              placeholderTextColor={COLORS.muted}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
              <TouchableOpacity onPress={() => setEditingCard(null)}>
                <Text style={{ color: COLORS.muted, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEditedTag}>
                <Text style={{ color: COLORS.accent, fontSize: 16, fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Scan & Import Choice Sheet Modal */}
      <Modal visible={showScanChoiceModal} transparent animationType="fade" onRequestClose={() => setShowScanChoiceModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowScanChoiceModal(false)}>
          <Animated.View
            entering={ZoomIn.duration(200)}
            exiting={FadeOut.duration(MotionTiming.quick)}
            style={[styles.choiceSheetModal, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="card" size={24} color={COLORS.accent} style={{ marginRight: 10 }} />
              <Text style={[styles.modalTitle, { color: COLORS.text, marginBottom: 0 }]}>Add to Card Wallet</Text>
            </View>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
              onPress={handleScanId2In1}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: COLORS.accent + '20' }]}>
                <Ionicons name="id-card-outline" size={22} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>2-in-1 ID Scanner</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Composite front & back onto one card page</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={handleScanCard}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="scan-outline" size={22} color="#F59E0B" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Scan Single Card (Camera Scanner)</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Google-grade auto-edge crop for business cards, passes & IDs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={handleImportGallery}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="images-outline" size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Choose from Photos</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Import an existing card photo from your gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <NativeScaleButton
              style={[styles.sheetOptionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginTop: 10 }]}
              onPress={handleImportFile}
              activeScale={0.96}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="document-text-outline" size={22} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>Select PDF File</Text>
                <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>Import insurance cards, e-Aadhaar, or medical PDFs</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </NativeScaleButton>

            <TouchableOpacity
              style={[styles.modalCancelBtn, { backgroundColor: COLORS.surface2, marginTop: 16 }]}
              onPress={() => setShowScanChoiceModal(false)}
            >
              <Text style={{ color: COLORS.text, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* 2-in-1 ID Scan Guide Modal */}
      <Modal visible={showIdGuideModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowIdGuideModal(false)}
        >
          <Animated.View
            entering={ZoomIn.duration(200)}
            style={[styles.idGuideModalContent, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
          >
            <View style={styles.idGuideHeader}>
              <View style={[styles.idGuideIconBox, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="card" size={26} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.idGuideTitle, { color: COLORS.text }]}>2-in-1 ID Scanner</Text>
                <Text style={[styles.idGuideSubtitle, { color: COLORS.muted }]}>
                  Two-Side Scan on Single PDF Page
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowIdGuideModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View style={[styles.idGuideStepsBox, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}>
              {/* Step 1 */}
              <View style={styles.idGuideStepRow}>
                <View style={[styles.stepCircle, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.stepCircleText}>1</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.stepRowTitle, { color: COLORS.text }]}>Scan Front Side</Text>
                  <Text style={[styles.stepRowDesc, { color: COLORS.muted }]}>
                    Google scanner will auto-detect edges, crop, and straighten the front of your card.
                  </Text>
                </View>
              </View>

              <View style={[styles.stepDividerLine, { backgroundColor: COLORS.border }]} />

              {/* Step 2 */}
              <View style={styles.idGuideStepRow}>
                <View style={[styles.stepCircle, { backgroundColor: '#F59E0B' }]}>
                  <Text style={styles.stepCircleText}>2</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.stepRowTitle, { color: COLORS.text }]}>Tap "+" in Scanner for Back</Text>
                  <Text style={[styles.stepRowDesc, { color: COLORS.muted }]}>
                    Flip card and capture back side (or tap checkmark if card is single-sided like PAN).
                  </Text>
                </View>
              </View>

              <View style={[styles.stepDividerLine, { backgroundColor: COLORS.border }]} />

              {/* Step 3 / Result */}
              <View style={styles.idGuideStepRow}>
                <View style={[styles.stepCircle, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.stepRowTitle, { color: COLORS.text }]}>Automatic 1-Page A4 Assembly</Text>
                  <Text style={[styles.stepRowDesc, { color: COLORS.muted }]}>
                    Both sides are automatically formatted onto 1 single PDF page with official KYC borders.
                  </Text>
                </View>
              </View>
            </View>

            <NativeScaleButton
              style={[styles.startScanBtn, { backgroundColor: COLORS.accent }]}
              onPress={() => {
                setShowIdGuideModal(false);
                router.push({
                  pathname: '/doc-scanner',
                  params: { initialMode: 'idcard', returnToCard: 'true', t: Date.now() },
                } as any);
              }}
              activeScale={0.95}
              hapticType="medium"
            >
              <Ionicons name="camera" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.startScanBtnText}>Open 2-in-1 Scanner</Text>
            </NativeScaleButton>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Preview Modal */}
      {previewItem && (() => {
        const rawUri = previewItem.uri || '';
        const formattedUri = rawUri.startsWith('file://') || rawUri.startsWith('content://') || rawUri.startsWith('http')
          ? rawUri
          : `file://${rawUri}`;
        const isPdf = rawUri.toLowerCase().endsWith('.pdf') || (previewItem.name || '').toLowerCase().endsWith('.pdf');

        return (
          <View style={[StyleSheet.absoluteFill, { zIndex: 2000, backgroundColor: COLORS.bg }]}>
            <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
              <View style={[styles.previewHeader, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
                <TouchableOpacity onPress={() => setPreviewItem(null)} style={{ padding: 8, marginRight: 8, marginLeft: -8 }}>
                  <Ionicons name="arrow-back" size={24} color={COLORS.text} />
                </TouchableOpacity>
                
                <View style={styles.previewTitleContainer}>
                  <Ionicons name="card" size={19} color={COLORS.accent} />
                  <Text style={[styles.previewTitle, { color: COLORS.text }]} numberOfLines={1}>{previewItem.name}</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setPreviewMode(m => m === 'text' ? 'original' : 'text')}
                  style={[styles.previewCloseBtn, { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }]}
                >
                  <Ionicons name={previewMode === 'text' ? 'image-outline' : 'document-text-outline'} size={17} color={COLORS.accent} />
                  <Text style={{ color: COLORS.accent, marginLeft: 5, fontWeight: '700', fontSize: 12 }}>
                    {previewMode === 'text' ? 'View Original' : 'View Text'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sub-bar: Left Tag Badge & Metadata | Right Download/Export & Share */}
              <View style={[styles.previewSubBar, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {previewItem.custom_tag ? (
                    <View style={[styles.subBarTagBadge, { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent }]}>
                      <Text style={[styles.subBarTagText, { color: COLORS.accent }]}>{previewItem.custom_tag}</Text>
                    </View>
                  ) : null}
                  <Text style={{ color: COLORS.muted, fontSize: 11.5 }}>
                    {isPdf ? 'PDF Card' : 'Card Photo'}
                  </Text>
                </View>

                <View style={styles.subBarActions}>
                  <TouchableOpacity
                    onPress={() => {
                      const textForBrain = previewItem.ocr_text || previewItem.name || '';
                      setPreviewItem(null);
                      router.push({
                        pathname: '/second-brain',
                        params: {
                          sharedText: encodeURIComponent(textForBrain),
                          sharedImageUri: encodeURIComponent(previewItem.uri),
                        },
                      });
                    }}
                    style={[styles.subBarActionBtn, { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent }]}
                    activeOpacity={0.7}
                    accessibilityLabel="Schedule in Brain"
                  >
                    <Ionicons name="sparkles" size={15} color={COLORS.accent} />
                    <Text style={[styles.subBarActionBtnText, { color: COLORS.accent, fontWeight: '700' }]}>To Brain</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleExportCard(previewItem)}
                    style={[styles.subBarActionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                    activeOpacity={0.7}
                    accessibilityLabel="Download or Export"
                  >
                    <Ionicons name="download-outline" size={16} color={COLORS.text} />
                    <Text style={[styles.subBarActionBtnText, { color: COLORS.text }]}>Export</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleShare(previewItem)}
                    style={[styles.subBarActionBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                    activeOpacity={0.7}
                    accessibilityLabel="Share"
                  >
                    <Ionicons name="share-outline" size={16} color={COLORS.text} />
                    <Text style={[styles.subBarActionBtnText, { color: COLORS.text }]}>Share</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {previewMode === 'original' ? (
                <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
                  {isPdf ? (
                    <SafePdfView
                      uri={formattedUri}
                      style={{ flex: 1 }}
                      colors={COLORS}
                    />
                  ) : (
                    <Image
                      source={{ uri: formattedUri }}
                      style={{ flex: 1, resizeMode: 'contain' }}
                      onError={(e) => console.warn('Card image error', e.nativeEvent)}
                    />
                  )}

                  {/* Floating Side Arrows in Original Mode */}
                  {filteredCards.length > 1 && currentCardIndex > 0 && (
                    <TouchableOpacity
                      onPress={() => handleNavigateCard(-1)}
                      style={[styles.floatingSideBtn, styles.floatingLeftBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-back" size={26} color="#fff" />
                    </TouchableOpacity>
                  )}

                  {filteredCards.length > 1 && currentCardIndex >= 0 && currentCardIndex < filteredCards.length - 1 && (
                    <TouchableOpacity
                      onPress={() => handleNavigateCard(1)}
                      style={[styles.floatingSideBtn, styles.floatingRightBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-forward" size={26} color="#fff" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={{ flex: 1, backgroundColor: COLORS.surface, padding: 16 }}>
                  <FlatList
                    data={[previewItem.custom_tag ? `[Card Tag: ${previewItem.custom_tag}]` : null, previewItem.ocr_text].filter(Boolean).join('\n\n').split('\n')}
                    keyExtractor={(_, i) => String(i)}
                    ListEmptyComponent={<Text style={{ color: COLORS.muted }}>No text available for preview.</Text>}
                    renderItem={({ item: line }) => (
                      <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 22, fontFamily: 'monospace' }} selectable>
                        {line || ' '}
                      </Text>
                    )}
                  />
                </View>
              )}

              {/* Related Cards Contextual Shelf */}
              {relatedCards.length > 0 && (
                <View style={[styles.relatedCardsContainer, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
                  <View style={styles.relatedCardsHeader}>
                    <Ionicons name="link" size={13} color={COLORS.accent} />
                    <Text style={[styles.relatedCardsTitle, { color: COLORS.text }]}>
                      Connected Documents ({relatedCards.length})
                    </Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedCardsScroll}>
                    {relatedCards.map(rc => (
                      <TouchableOpacity
                        key={rc.card.id}
                        onPress={() => setPreviewItem(rc.card)}
                        style={[styles.relatedCardChip, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="document-text-outline" size={13} color={COLORS.accent} />
                        <Text style={[styles.relatedCardChipText, { color: COLORS.text }]} numberOfLines={1}>
                          {rc.card.name}
                        </Text>
                        <View style={[styles.relatedCardMatchBadge, { backgroundColor: COLORS.accent + '20' }]}>
                          <Text style={[styles.relatedCardMatchText, { color: COLORS.accent }]}>
                            {Math.round(rc.similarity * 100)}%
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Inline Bottom Bar: Edit Tag, Copy Text, Organizer, Delete */}
              <View style={[styles.previewBottomBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
                <TouchableOpacity
                  onPress={() => { setEditTagInput(previewItem.custom_tag || ''); setEditingCard(previewItem); }}
                  style={[styles.bottomBarBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                  activeOpacity={0.7}
                  accessibilityLabel="Edit Tag"
                >
                  <Ionicons name="pencil-outline" size={17} color={COLORS.accent} />
                  <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]}>Edit Tag</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleCopyText(previewItem)}
                  style={[styles.bottomBarBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                  activeOpacity={0.7}
                  accessibilityLabel="Copy Text"
                >
                  <Ionicons name="copy-outline" size={17} color={COLORS.accent} />
                  <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]}>Copy Text</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleOpenOrganizer(previewItem)}
                  style={[styles.bottomBarBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                  activeOpacity={0.7}
                  accessibilityLabel="Organizer"
                >
                  <Ionicons name="layers-outline" size={17} color={COLORS.accent} />
                  <Text style={[styles.bottomBarBtnText, { color: COLORS.text }]}>Organizer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    const itemToDelete = previewItem;
                    handleDeleteCard(itemToDelete);
                  }}
                  style={[styles.bottomBarBtn, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                  activeOpacity={0.7}
                  accessibilityLabel="Delete"
                >
                  <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                  <Text style={[styles.bottomBarBtnText, { color: COLORS.danger }]}>Delete</Text>
                </TouchableOpacity>
              </View>

              {/* Light Gallery Card Navigation Bar (Works for Both View Text & View Original) */}
              {filteredCards.length > 1 && currentCardIndex >= 0 && (
                <View style={[styles.galleryNavBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
                  <TouchableOpacity
                    onPress={() => handleNavigateCard(-1)}
                    disabled={currentCardIndex <= 0}
                    style={[
                      styles.galleryNavBtn,
                      { backgroundColor: currentCardIndex <= 0 ? COLORS.surface2 : COLORS.accentSoft + '22' }
                    ]}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={currentCardIndex <= 0 ? COLORS.muted : COLORS.accent}
                    />
                    <Text style={[
                      styles.galleryNavBtnText,
                      { color: currentCardIndex <= 0 ? COLORS.muted : COLORS.accent }
                    ]}>
                      Prev
                    </Text>
                  </TouchableOpacity>

                  <View style={[styles.galleryIndexBadge, { backgroundColor: COLORS.surface2 }]}>
                    <Ionicons name="card-outline" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
                    <Text style={[styles.galleryIndexText, { color: COLORS.text }]}>
                      <Text style={{ fontWeight: 'bold', color: COLORS.accent }}>{currentCardIndex + 1}</Text>
                      <Text style={{ color: COLORS.muted }}> / {filteredCards.length}</Text>
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleNavigateCard(1)}
                    disabled={currentCardIndex >= filteredCards.length - 1}
                    style={[
                      styles.galleryNavBtn,
                      { backgroundColor: currentCardIndex >= filteredCards.length - 1 ? COLORS.surface2 : COLORS.accentSoft + '22' }
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.galleryNavBtnText,
                      { color: currentCardIndex >= filteredCards.length - 1 ? COLORS.muted : COLORS.accent }
                    ]}>
                      Next
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={currentCardIndex >= filteredCards.length - 1 ? COLORS.muted : COLORS.accent}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      })()}

      {/* Export Modal */}
      <ExportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        content={exportContentText}
        defaultFileName={exportFileName}
        imageUri={exportImageUri}
      />

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

      {/* Image Crop & Border Alignment Modal */}
      <ImageCropModal
        visible={cropModalVisible}
        imageUri={cropTargetImage?.uri || null}
        fileName={cropTargetImage?.name}
        onClose={() => setCropModalVisible(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { fontSize: 11, marginTop: 2 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerScanBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  headerScanBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  headerGridToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBanner: { marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  heroBannerTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroBannerTitle: { fontSize: 15, fontWeight: '700' },
  badgePrivate: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, gap: 3 },
  badgePrivateText: { color: '#10B981', fontSize: 10, fontWeight: '700' },
  heroBannerSubtitle: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  heroChipsRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  heroFeaturePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, gap: 4 },
  heroFeatureText: { fontSize: 11, fontWeight: '600' },
  categoryScrollContainer: { marginTop: 10, marginBottom: 4 },
  categoryRow: { paddingHorizontal: 16, gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  categoryChipText: { fontSize: 13 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyScanBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 18 },
  emptyScanBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  tagSuggestionChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  tagSuggestionText: { fontSize: 12, fontWeight: '600' },
  choiceSheetModal: { width: '100%', maxWidth: 380, borderRadius: 16, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  sheetOptionBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  optionIconBox: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  modalCancelBtn: { paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  listContent: { padding: 16 },
  cardContainer: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: { 
    width: '100%', 
    height: 80, 
    borderRadius: 8,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardInfo: { padding: 12 },
  tagBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  tagText: { color: '#fff', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  cardName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  ocrSnippet: { fontSize: 12 },
  cardActionsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  compactCardContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  compactCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  compactThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  compactInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  compactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  compactTagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  compactTagText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  compactSnippet: {
    fontSize: 11,
    lineHeight: 15,
  },
  compactActionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  compactActionBtn: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  compactActionLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  gridCardContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  actionBtnGrid: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  previewTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10, gap: 8 },
  previewTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  previewCloseBtn: { padding: 6 },
  previewSubBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  subBarTagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  subBarTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  subBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subBarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  subBarActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  previewBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  bottomBarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
  },
  bottomBarBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  editModalContent: {
    width: '100%',
    borderRadius: 12,
    padding: 24,
  },
  galleryNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  galleryNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  galleryNavBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  galleryIndexBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  galleryIndexText: {
    fontSize: 13,
    fontWeight: '600',
  },
  floatingSideBtn: {
    position: 'absolute',
    top: '46%',
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  floatingLeftBtn: {
    left: 12,
  },
  floatingRightBtn: {
    right: 12,
  },
  idGuideModalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  idGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  idGuideIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idGuideTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  idGuideSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  idGuideStepsBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  idGuideStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepCircleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepRowTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepRowDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  stepDividerLine: {
    height: 1,
    marginVertical: 10,
    marginLeft: 32,
  },
  startScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  startScanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Smart Folders
  smartFoldersContainer: {
    padding: 16,
    paddingBottom: 90,
  },
  smartFoldersHeaderRow: {
    marginBottom: 16,
  },
  smartFoldersHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  smartFoldersHeaderSub: {
    fontSize: 12,
    marginTop: 2,
  },
  smartFoldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  smartFolderCard: {
    width: '48%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  smartFolderIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  smartFolderTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  smartFolderHindi: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  smartFolderCountBadge: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  smartFolderCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  smartFolderActiveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  smartFolderBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  smartFolderBackText: {
    fontSize: 13,
    fontWeight: '700',
  },
  smartFolderActiveInfo: {
    flex: 1,
  },
  smartFolderActiveTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  smartFolderActiveCount: {
    fontSize: 11.5,
    marginTop: 1,
  },

  // Expiry Badge
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 6,
  },
  expiryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Related Cards
  relatedCardsContainer: {
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  relatedCardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  relatedCardsTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  relatedCardsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  relatedCardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 200,
  },
  relatedCardChipText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  relatedCardMatchBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  relatedCardMatchText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ----------------------------------------------------
  // Vault Lock Screen & PIN Styles
  // ----------------------------------------------------
  lockScreenWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lockIconGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  lockScreenTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  lockScreenSub: {
    fontSize: 13.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  pinDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 10,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  pinErrorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 20,
    marginBottom: 8,
  },
  pinErrorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  keypadContainer: {
    width: '100%',
    maxWidth: 290,
    marginTop: 10,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  keypadKey: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadKeyText: {
    fontSize: 26,
    fontWeight: '700',
  },
  keypadKeyAction: {
    borderWidth: 0,
  },
  keypadForgotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  keypadCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // PIN Modals
  pinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pinModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
  },
  pinModalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  pinModalIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  pinModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  pinModalSubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  modalKeypadContainer: {
    width: '100%',
    maxWidth: 270,
    marginTop: 8,
  },
  modalKeypadKey: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Action sheet menu
  pinActionSheetCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  pinSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  pinSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  pinSheetSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  pinSheetDivider: {
    height: 1,
    marginBottom: 12,
  },
  pinSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  pinSheetItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSheetItemText: {
    fontSize: 15,
    fontWeight: '700',
  },
  pinSheetItemSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  pinSheetCancelBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  pinSheetCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
