/**
 * Bookmarks Screen — View + open bookmarked files with thumbnails & Light Gallery navigation.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafePdfView } from '../components/SafePdfView';
import { WebView } from 'react-native-webview';

import {
  getBookmarks,
  removeBookmark,
  updateBookmarkTags,
  Bookmark as BookmarkType,
} from '../services/bookmarksService';
import { formatSize, formatDate } from '../utils/format';
import { useThemeColors, SIZES, FONTS } from '../utils/theme';
import { ThemedAlertModal, AlertButton } from '../components/ThemedAlertModal';
import { ExportModal } from '../components/ExportModal';
import { ImageCropModal } from '../components/ImageCropModal';
import { TagManagementModal } from '../components/TagManagementModal';
import { HeaderMenuButton } from '../components/QuickNavModal';
import { getFileContentById, getDatabase } from '../services/database';
import { extractDocxHtml, extractXlsxHtml } from '../services/contentExtractor';
import { autoCategorizeAllIndexedFiles } from '../utils/autoCategorizer';

interface BookmarkWithContent extends BookmarkType {
  contentText?: string | null;
  ocrText?: string | null;
}

export default function BookmarksScreen() {
  const COLORS = useThemeColors();
  const styles = useMemo(() => getStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [bookmarks, setBookmarks] = useState<BookmarkWithContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  
  // View mode (default List view)
  const [isGridView, setIsGridView] = useState(false);

  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<BookmarkWithContent | null>(null);
  const [previewMode, setPreviewMode] = useState<'original' | 'text'>('original');
  const [docHtml, setDocHtml] = useState<string>('');

  // Export Modal State
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportContentText, setExportContentText] = useState('');
  const [exportFileName, setExportFileName] = useState('');
  const [exportImageUri, setExportImageUri] = useState<string | null>(null);

  // Image Crop & Border Align State
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [cropTargetImage, setCropTargetImage] = useState<{ uri: string; name: string } | null>(null);

  // Tag Management Modal State
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagTargetItem, setTagTargetItem] = useState<BookmarkWithContent | null>(null);

  const handleOpenTagManager = (item: BookmarkWithContent) => {
    setTagTargetItem(item);
    setTagModalVisible(true);
  };

  const handleSaveTags = async (newTags: string[]) => {
    if (!tagTargetItem) return;
    try {
      await updateBookmarkTags(tagTargetItem.fileUri, newTags);
      const jsonTags = newTags.length > 0 ? JSON.stringify(newTags) : undefined;
      tagTargetItem.tags = jsonTags;
      if (previewItem && previewItem.fileUri === tagTargetItem.fileUri) {
        setPreviewItem({ ...previewItem, tags: jsonTags });
      }
      load();
      showAlert('Tags Updated', 'Bookmark tags saved successfully!', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
    } catch (e: any) {
      showAlert('Error', 'Failed to update tags.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
    }
  };

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

  const tags = useMemo(() => {
    const allTags = new Set<string>();
    for (const b of bookmarks) {
      if (b.parsedTags) {
        for (const t of b.parsedTags) {
          allTags.add(t);
        }
      }
    }
    return Array.from(allTags).sort();
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    const targetTag = activeTag || (tags.length > 0 ? tags[0] : null);
    if (!targetTag) return bookmarks;
    return bookmarks.filter(b => b.parsedTags && b.parsedTags.includes(targetTag));
  }, [bookmarks, activeTag, tags]);

  const load = useCallback(async () => {
    try {
      const list = await getBookmarks();
      setBookmarks(list);
    } catch (e) {
      console.warn('Failed to load bookmarks:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Load document HTML for Docx / Excel / CSV when in original preview
  useEffect(() => {
    if (previewItem && previewMode === 'original') {
      const ext = (previewItem.extension || previewItem.fileName.split('.').pop() || '').toLowerCase();
      if (ext === 'docx') {
        extractDocxHtml(previewItem.fileUri).then(setDocHtml);
      } else if (ext === 'xlsx' || ext === 'csv') {
        extractXlsxHtml(previewItem.fileUri).then(setDocHtml);
      } else {
        setDocHtml('');
      }
    }
  }, [previewItem, previewMode]);

  // Light Gallery: Current Bookmark Index
  const currentBookmarkIndex = useMemo(() => {
    if (!previewItem || filteredBookmarks.length === 0) return -1;
    return filteredBookmarks.findIndex(b => 
      (b.id && previewItem.id && b.id === previewItem.id) ||
      b.fileUri === previewItem.fileUri
    );
  }, [previewItem, filteredBookmarks]);

  const handleOpenPreview = async (item: BookmarkWithContent) => {
    if (!item.contentText && !item.ocrText) {
      try {
        if (item.fileId) {
          const content = await getFileContentById(item.fileId);
          item.contentText = content.contentText;
          item.ocrText = content.ocrText;
        } else {
          // Attempt lookup by URI from files table
          const db = await getDatabase();
          const res = await db.getFirstAsync<{ id: number; content_text: string | null; ocr_text: string | null }>(
            'SELECT id, content_text, ocr_text FROM files WHERE uri = ?',
            [item.fileUri]
          );
          if (res) {
            item.fileId = res.id;
            item.contentText = res.content_text;
            item.ocrText = res.ocr_text;
          }
        }
      } catch (e) {}
    }
    setPreviewItem(item);
  };

  const handleNavigateBookmark = useCallback(async (direction: -1 | 1) => {
    if (currentBookmarkIndex === -1 || filteredBookmarks.length === 0) return;
    const newIndex = currentBookmarkIndex + direction;
    if (newIndex >= 0 && newIndex < filteredBookmarks.length) {
      const nextItem = filteredBookmarks[newIndex];
      if (!nextItem.contentText && !nextItem.ocrText) {
        try {
          if (nextItem.fileId) {
            const content = await getFileContentById(nextItem.fileId);
            nextItem.contentText = content.contentText;
            nextItem.ocrText = content.ocrText;
          } else {
            const db = await getDatabase();
            const res = await db.getFirstAsync<{ id: number; content_text: string | null; ocr_text: string | null }>(
              'SELECT id, content_text, ocr_text FROM files WHERE uri = ?',
              [nextItem.fileUri]
            );
            if (res) {
              nextItem.fileId = res.id;
              nextItem.contentText = res.content_text;
              nextItem.ocrText = res.ocr_text;
            }
          }
        } catch (e) {}
      }
      setPreviewItem(nextItem);
    }
  }, [currentBookmarkIndex, filteredBookmarks]);

  const handleAddToCard = (item: BookmarkWithContent) => {
    const uri = item.fileUri || '';
    const fileId = item.fileId ? String(item.fileId) : '';
    const name = item.fileName || '';
    let parsedTag = '';
    if (item.tags) {
      try {
        const arr = JSON.parse(item.tags);
        if (Array.isArray(arr) && arr.length > 0) parsedTag = arr[0];
      } catch (e) {}
    }
    router.push({
      pathname: '/create-card',
      params: {
        fileUri: uri,
        fileId: fileId,
        initialTag: parsedTag,
        fileName: name,
      }
    });
  };

  const handleShareDirect = async (item: BookmarkWithContent) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        let shareUri = item.fileUri;
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
    } catch (e: any) {
      if (!e?.message?.includes('Another share request')) {
        console.warn('Share error:', e);
      }
    }
  };

  const handleShare = async (item: BookmarkWithContent) => {
    const ext = (item.extension || item.fileName.split('.').pop() || '').toLowerCase();
    const isImage = ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i);

    if (isImage) {
      showAlert(
        'Share Image',
        `How would you like to share "${item.fileName}"?`,
        [
          {
            text: '✂️ Crop & Align Borders',
            style: 'default',
            onPress: () => {
              hideAlert();
              setCropTargetImage({ uri: item.fileUri, name: item.fileName });
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

  const handleCopyText = async () => {
    if (!previewItem) return;
    const text = previewItem.ocrText || previewItem.contentText || '';
    if (!text.trim()) {
      showAlert('No Content', 'No text available to copy.', [{ text: 'OK', style: 'default', onPress: hideAlert }]);
      return;
    }
    await Clipboard.setStringAsync(text);
    showAlert('Copied', 'Document text copied to clipboard!', [{ text: 'OK', style: 'default', onPress: hideAlert }], { icon: 'checkmark-circle', iconColor: COLORS.success });
  };

  const openExportModal = () => {
    if (!previewItem) return;
    const text = previewItem.ocrText || previewItem.contentText || '';
    const ext = (previewItem.extension || previewItem.fileName.split('.').pop() || '').toLowerCase();
    const isImg = ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i);
    
    setExportContentText(text);
    setExportFileName(previewItem.fileName);
    setExportImageUri(isImg ? previewItem.fileUri : null);
    setExportModalVisible(true);
  };

  const handleRemove = async (uri: string) => {
    showAlert(
      'Remove Bookmark',
      'Are you sure you want to remove this bookmark?',
      [
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            await removeBookmark(uri);
            if (previewItem && previewItem.fileUri === uri) {
              setPreviewItem(null);
            }
            load();
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
      { icon: 'trash-outline', iconColor: COLORS.danger }
    );
  };

  const handleClearAll = () => {
    showAlert(
      'Clear All Bookmarks',
      'Are you sure you want to delete all your bookmarks? This cannot be undone.',
      [
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            hideAlert();
            const { clearAllBookmarks } = require('../services/bookmarksService');
            await clearAllBookmarks();
            setBookmarks([]);
            setPreviewItem(null);
          }
        },
        { text: 'Cancel', style: 'cancel', onPress: hideAlert },
      ],
      { icon: 'trash', iconColor: COLORS.danger }
    );
  };

  const docxWebViewSource = useMemo(() => {
    return {
      html: docHtml ? `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <style>
              body {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: ${COLORS.surface};
                padding: 16px;
                line-height: 1.6;
              }
              * { color: ${COLORS.text} !important; }
              img { max-width: 100%; height: auto; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid ${COLORS.border}; padding: 8px; text-align: left; }
              th { background-color: ${COLORS.surface2}; }
            </style>
          </head>
          <body>${docHtml}</body>
        </html>
      ` : `<div style="padding: 20px; font-family: sans-serif; color: ${COLORS.text};">Loading preview...</div>`
    };
  }, [docHtml, COLORS.surface, COLORS.surface2, COLORS.text, COLORS.border]);

  const renderItem = ({ item }: { item: BookmarkWithContent }) => {
    const ext = (item.extension || item.fileName.split('.').pop() || '').toLowerCase();
    const isImage = ext.match(/^(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i);
    const isPdf = ext === 'pdf';
    const uri = item.fileUri || '';
    const imageUri = uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;

    const parsedTags = item.parsedTags || [];

    if (isGridView) {
      return (
        <View style={[styles.gridCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          <TouchableOpacity 
            style={{ flex: 1 }} 
            onPress={() => handleOpenPreview(item)}
            activeOpacity={0.75}
          >
            {/* Grid Thumbnail */}
            <View style={[styles.gridThumbWrap, { backgroundColor: COLORS.surface2 }]}>
              {isImage ? (
                <Image 
                  source={{ uri: imageUri }} 
                  style={{ width: '100%', height: '100%' }} 
                  resizeMode="cover" 
                />
              ) : isPdf ? (
                <View style={styles.gridFileCenter}>
                  <Ionicons name="document-text" size={34} color="#EF4444" />
                  <Text style={[styles.gridFileExt, { color: '#EF4444' }]}>PDF</Text>
                </View>
              ) : ext.match(/^(docx|doc)$/i) ? (
                <View style={styles.gridFileCenter}>
                  <Ionicons name="document-text" size={34} color="#3B82F6" />
                  <Text style={[styles.gridFileExt, { color: '#3B82F6' }]}>DOCX</Text>
                </View>
              ) : ext.match(/^(xlsx|xls|csv)$/i) ? (
                <View style={styles.gridFileCenter}>
                  <Ionicons name="grid-outline" size={34} color="#10B981" />
                  <Text style={[styles.gridFileExt, { color: '#10B981' }]}>XLSX</Text>
                </View>
              ) : (
                <View style={styles.gridFileCenter}>
                  <Ionicons name="document-text" size={34} color={COLORS.accentSoft} />
                  <Text style={[styles.gridFileExt, { color: COLORS.accentSoft }]}>{ext.toUpperCase() || 'FILE'}</Text>
                </View>
              )}
            </View>

            {/* Grid Info */}
            <View style={styles.gridInfo}>
              <Text style={[styles.gridName, { color: COLORS.text }]} numberOfLines={1}>
                {item.fileName}
              </Text>
              <Text style={[styles.gridDate, { color: COLORS.muted }]}>
                {item.size ? `${formatSize(item.size)} • ` : ''}{formatDate(item.created)}
              </Text>
              {parsedTags.length > 0 && (
                <View style={styles.gridTagsWrap}>
                  {parsedTags.slice(0, 2).map((t: string) => (
                    <View key={t} style={[styles.gridTagBadge, { backgroundColor: COLORS.surface2 }]}>
                      <Text style={[styles.gridTagText, { color: COLORS.accent }]}>#{t}</Text>
                    </View>
                  ))}
                  {parsedTags.length > 2 && (
                    <Text style={{ fontSize: 9, color: COLORS.muted }}>+{parsedTags.length - 2}</Text>
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Grid Actions */}
          <View style={[styles.gridActions, { borderTopColor: COLORS.border }]}>
            <TouchableOpacity onPress={() => handleOpenTagManager(item)} style={styles.gridActionBtn}>
              <Ionicons name="pricetag-outline" size={16} color={COLORS.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleAddToCard(item)} style={styles.gridActionBtn}>
              <Ionicons name="card-outline" size={16} color={COLORS.accentSoft} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleShare(item)} style={styles.gridActionBtn}>
              <Ionicons name="share-outline" size={16} color={COLORS.accentSoft} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleRemove(item.fileUri)} style={styles.gridActionBtn}>
              <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity style={styles.row} onPress={() => handleOpenPreview(item)}>
        {/* Thumbnail Preview */}
        <View style={[styles.icon, { overflow: 'hidden', padding: 0 }]}>
          {isImage ? (
            <Image 
              source={{ uri: imageUri }} 
              style={{ width: '100%', height: '100%', backgroundColor: COLORS.surface2 }}
              resizeMode="cover"
            />
          ) : isPdf ? (
            <Ionicons name="document-text" size={22} color="#EF4444" />
          ) : ext.match(/^(docx|doc)$/i) ? (
            <Ionicons name="document-text" size={22} color="#3B82F6" />
          ) : ext.match(/^(xlsx|xls|csv)$/i) ? (
            <Ionicons name="grid-outline" size={22} color="#10B981" />
          ) : (
            <Ionicons name="document-text" size={22} color={COLORS.accentSoft} />
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.fileName}</Text>
          <Text style={styles.date}>
            {item.size ? `${formatSize(item.size)} | ` : ''}{formatDate(item.created)}
          </Text>
          {parsedTags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {parsedTags.map((t: string) => (
                <View key={t} style={{ backgroundColor: COLORS.surface2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, color: COLORS.accent, fontWeight: '600' }}>#{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            onPress={(e) => { e.stopPropagation(); handleOpenTagManager(item); }} 
            style={[styles.actionBtn, { marginRight: 2 }]}
            accessibilityLabel="Manage Tags"
          >
            <Ionicons name="pricetag-outline" size={18} color={COLORS.accent} />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={(e) => { e.stopPropagation(); handleAddToCard(item); }} 
            style={[styles.actionBtn, { marginRight: 2 }]}
            accessibilityLabel="Add to Card"
          >
            <Ionicons name="card-outline" size={19} color={COLORS.accentSoft} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={(e) => { e.stopPropagation(); handleShare(item); }} 
            style={styles.actionBtn}
          >
            <Ionicons name="share-outline" size={19} color={COLORS.accentSoft} />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={(e) => { e.stopPropagation(); handleRemove(item.fileUri); }} 
            style={styles.removeBtn}
          >
            <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/documents');
            }}
            style={{ padding: 6, marginRight: 2 }}
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Ionicons name="bookmark" size={24} color={COLORS.accent} />
          <Text style={[styles.brandTitle, { flex: 1 }]} numberOfLines={1}>Bookmarks</Text>
        </View>

        {/* Top-Right Action Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {bookmarks.length > 0 && (
            <TouchableOpacity 
              onPress={handleClearAll} 
              style={{ paddingHorizontal: 8, paddingVertical: 5 }}
              accessibilityLabel="Clear All Bookmarks"
            >
              <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 13 }}>Clear</Text>
            </TouchableOpacity>
          )}

          {/* Toggle List / Grid View */}
          <TouchableOpacity 
            onPress={() => setIsGridView(!isGridView)} 
            style={[styles.headerCircleBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            accessibilityLabel="Toggle View Mode"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name={isGridView ? "list" : "grid"} size={18} color={COLORS.accent} />
          </TouchableOpacity>

          {/* Top-Right Menu Icon Button */}
          <HeaderMenuButton />
        </View>
      </View>

      {/* Tag Filters */}
      {tags.length > 0 && (
        <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SIZES.padding, gap: 8 }}>
            {tags.map(t => {
              const isActive = (activeTag || tags[0]) === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.tagChip, isActive && styles.tagChipActive]}
                  onPress={() => setActiveTag(t)}
                >
                  <Text style={[styles.tagLabel, isActive && styles.tagLabelActive]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Bookmarks List / Grid */}
      <FlatList
        key={isGridView ? 'grid' : 'list'}
        data={filteredBookmarks}
        keyExtractor={(item) => String(item.id || item.fileUri)}
        renderItem={renderItem}
        contentContainerStyle={[
          isGridView ? styles.gridListContainer : styles.listContainer,
          { paddingBottom: Math.max(insets.bottom, 24) + 60 }
        ]}
        numColumns={isGridView ? 2 : 1}
        columnWrapperStyle={isGridView ? { justifyContent: 'space-between', paddingHorizontal: SIZES.padding } : undefined}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={11}
        removeClippedSubviews={false}
        updateCellsBatchingPeriod={30}
        ListEmptyComponent={
          loading ? (
            <View style={[styles.emptyState, { paddingTop: 60 }]}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={[styles.emptySubText, { marginTop: 12 }]}>Loading bookmarks...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.ctaIconWrap}>
                <Ionicons name="bookmark-outline" size={48} color={COLORS.muted} />
              </View>
              <Text style={styles.emptyText}>No bookmarks</Text>
              <Text style={styles.emptySubText}>
                Long-press any search result to bookmark it for quick access.
              </Text>
            </View>
          )
        }
      />

      {/* Preview Modal (Light Gallery Style) */}
      {previewItem && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 2000, backgroundColor: COLORS.bg }]}>
          <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
            <View style={styles.previewHeader}>
              <TouchableOpacity onPress={() => { setPreviewItem(null); setPreviewMode('original'); }} style={{ padding: 8, marginRight: 8, marginLeft: -8 }}>
                <Ionicons name="arrow-back" size={24} color={COLORS.text} />
              </TouchableOpacity>
              
              <View style={styles.previewTitleContainer}>
                <Ionicons 
                  name={previewItem.fileName.match(/\.(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i) ? 'image' : 'document-text'} 
                  size={20} 
                  color={COLORS.accentSoft} 
                />
                <Text style={styles.previewTitle} numberOfLines={1}>{previewItem.fileName}</Text>
              </View>

              <View style={{ flexDirection: 'row', flexShrink: 1, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={() => setPreviewMode(m => m === 'text' ? 'original' : 'text')} style={[styles.previewCloseBtn, { flexDirection: 'row', alignItems: 'center' }]}>
                  <Ionicons name={previewMode === 'text' ? 'image-outline' : 'document-text-outline'} size={22} color={COLORS.accentSoft} />
                  <Text style={{ color: COLORS.accentSoft, marginLeft: 6, fontWeight: '600' }}>
                    {previewMode === 'text' ? 'View Original' : 'View Text'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleOpenTagManager(previewItem)} style={styles.previewCloseBtn} accessibilityLabel="Manage Tags">
                  <Ionicons name="pricetag-outline" size={22} color={COLORS.accentSoft} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAddToCard(previewItem)} style={styles.previewCloseBtn} accessibilityLabel="Add to Card">
                  <Ionicons name="card-outline" size={22} color={COLORS.accentSoft} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleCopyText()} style={styles.previewCloseBtn}>
                  <Ionicons name="copy-outline" size={22} color={COLORS.accentSoft} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openExportModal()} style={styles.previewCloseBtn}>
                  <Ionicons name="download-outline" size={22} color={COLORS.accentSoft} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleShare(previewItem)} style={styles.previewCloseBtn}>
                  <Ionicons name="share-outline" size={22} color={COLORS.accentSoft} />
                </TouchableOpacity>
              </View>
            </View>

            {previewMode === 'original' ? (
              <View style={{ flex: 1, backgroundColor: COLORS.surface }}>
                {previewItem.fileName.match(/\.(jpg|jpeg|png|bmp|gif|webp|tif|tiff)$/i) ? (
                  <Image 
                    source={{ uri: previewItem.fileUri }} 
                    style={{ flex: 1, resizeMode: 'contain' }} 
                  />
                ) : (previewItem.extension || previewItem.fileName.split('.').pop() || '').toLowerCase() === 'pdf' ? (
                  <SafePdfView
                    uri={previewItem.fileUri}
                    style={{ flex: 1 }}
                    colors={COLORS}
                  />
                ) : (previewItem.extension || previewItem.fileName.split('.').pop() || '').toLowerCase().match(/^(docx|xlsx|csv)$/i) ? (
                  <WebView 
                    source={docxWebViewSource}
                    style={{ flex: 1, backgroundColor: COLORS.surface }} 
                    originWhitelist={['*']}
                  />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="document-text" size={64} color={COLORS.muted} />
                    <Text style={{ marginTop: 16, color: COLORS.text, fontSize: 16, marginBottom: 24 }}>
                      Document preview not available natively.
                    </Text>
                    <TouchableOpacity 
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 }}
                      onPress={() => handleShare(previewItem)}
                    >
                      <Ionicons name="open-outline" size={20} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 8 }}>Open with Native App</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Floating Side Navigation Arrows in Original Mode */}
                {filteredBookmarks.length > 1 && currentBookmarkIndex > 0 && (
                  <TouchableOpacity
                    onPress={() => handleNavigateBookmark(-1)}
                    style={[styles.floatingSideBtn, styles.floatingLeftBtn, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={26} color="#fff" />
                  </TouchableOpacity>
                )}

                {filteredBookmarks.length > 1 && currentBookmarkIndex >= 0 && currentBookmarkIndex < filteredBookmarks.length - 1 && (
                  <TouchableOpacity
                    onPress={() => handleNavigateBookmark(1)}
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
                  data={(previewItem.ocrText || previewItem.contentText || '').split('\n')}
                  keyExtractor={(_, i) => String(i)}
                  ListEmptyComponent={<Text style={{ color: COLORS.muted, padding: 16 }}>No extracted text available for this bookmark.</Text>}
                  renderItem={({ item: line }) => {
                    const pageMatch = line.match(/\[Page (\d+)\]/i);
                    if (pageMatch) {
                      return (
                        <View style={{ backgroundColor: COLORS.surface2, padding: 8, marginVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'center' }}>
                          <Text style={{ color: COLORS.accent, fontWeight: 'bold', fontSize: 13 }}>
                            📄 Page {pageMatch[1]}
                          </Text>
                        </View>
                      );
                    }
                    return (
                      <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 22 }} selectable>
                        {line || ' '}
                      </Text>
                    );
                  }}
                />
              </View>
            )}

            {/* Light Gallery Result Navigation Bar (Works for Both View Text & View Original) */}
            {filteredBookmarks.length > 1 && currentBookmarkIndex >= 0 && (
              <View style={[styles.galleryNavBar, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
                <TouchableOpacity
                  onPress={() => handleNavigateBookmark(-1)}
                  disabled={currentBookmarkIndex <= 0}
                  style={[
                    styles.galleryNavBtn,
                    { backgroundColor: currentBookmarkIndex <= 0 ? COLORS.surface2 : COLORS.accentSoft + '22' }
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={currentBookmarkIndex <= 0 ? COLORS.muted : COLORS.accent}
                  />
                  <Text style={[
                    styles.galleryNavBtnText,
                    { color: currentBookmarkIndex <= 0 ? COLORS.muted : COLORS.accent }
                  ]}>
                    Prev
                  </Text>
                </TouchableOpacity>

                <View style={[styles.galleryIndexBadge, { backgroundColor: COLORS.surface2 }]}>
                  <Ionicons name="bookmark-outline" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.galleryIndexText, { color: COLORS.text }]}>
                    <Text style={{ fontWeight: 'bold', color: COLORS.accent }}>{currentBookmarkIndex + 1}</Text>
                    <Text style={{ color: COLORS.muted }}> / {filteredBookmarks.length}</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleNavigateBookmark(1)}
                  disabled={currentBookmarkIndex >= filteredBookmarks.length - 1}
                  style={[
                    styles.galleryNavBtn,
                    { backgroundColor: currentBookmarkIndex >= filteredBookmarks.length - 1 ? COLORS.surface2 : COLORS.accentSoft + '22' }
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.galleryNavBtnText,
                    { color: currentBookmarkIndex >= filteredBookmarks.length - 1 ? COLORS.muted : COLORS.accent }
                  ]}>
                    Next
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={currentBookmarkIndex >= filteredBookmarks.length - 1 ? COLORS.muted : COLORS.accent}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}

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

      {/* Smart Tag Management Modal */}
      <TagManagementModal
        visible={tagModalVisible}
        fileUri={tagTargetItem?.fileUri || ''}
        fileName={tagTargetItem?.fileName || ''}
        initialTags={(() => {
          if (!tagTargetItem?.tags) return [];
          try {
            const parsed = JSON.parse(tagTargetItem.tags);
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            return [];
          }
        })()}
        contentText={tagTargetItem?.contentText}
        ocrText={tagTargetItem?.ocrText}
        onSave={handleSaveTags}
        onClose={() => {
          setTagModalVisible(false);
          setTagTargetItem(null);
        }}
      />
    </View>
  );
}

const getStyles = (COLORS: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  brandTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surface2,
  },
  tagChipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  tagLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  tagLabelActive: {
    color: COLORS.bg,
  },
  listContainer: { padding: SIZES.padding },
  gridListContainer: { paddingVertical: 10, paddingBottom: 30 },
  gridCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  gridThumbWrap: {
    width: '100%',
    height: 105,
    overflow: 'hidden',
  },
  gridFileCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gridFileExt: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gridInfo: {
    padding: 10,
    flex: 1,
  },
  gridName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  gridDate: {
    fontSize: 10.5,
    marginBottom: 4,
  },
  gridTagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  gridTagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gridTagText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  gridActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  gridActionBtn: {
    padding: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.surface2,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1.5,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 9,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: { flex: 1, marginRight: 8 },
  name: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  date: { color: COLORS.muted, fontSize: 12 },
  actionBtn: {
    padding: 6,
    marginRight: 4,
  },
  removeBtn: {
    padding: 6,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    marginLeft: 4,
  },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 60 },
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

  // Preview Modal Styles
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  previewTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 12,
  },
  previewTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  previewCloseBtn: {
    padding: 8,
    marginLeft: 4,
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
});

