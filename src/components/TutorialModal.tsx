import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../utils/theme';
import { shareAppWithFriends } from '../utils/shareUtils';
import { Haptics } from '../utils/haptics';

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
  initialTab?: number;
}

interface TutorialTab {
  id: string;
  title: string;
  shortTitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge: string;
  badgeColor: string;
  headline: string;
  description: string;
  features: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
  }[];
  proTip: string;
}

const TUTORIAL_TABS: TutorialTab[] = [
  {
    id: 'search',
    title: 'Deep Search & Semantic AI',
    shortTitle: 'Search & AI',
    icon: 'search',
    badge: 'FTS5 + VECTORS',
    badgeColor: '#0284C7',
    headline: 'Instant Full-Text & Natural Language AI Search',
    description:
      'Search inside the actual text of PDFs, Word documents, Excel spreadsheets, and photos without uploading a single byte to the cloud.',
    features: [
      {
        icon: 'flash-outline',
        title: 'Instant Deep Full-Text Search',
        desc: 'Search across all your PDFs, DOCX, XLSX, TXT files using on-device SQLite FTS5 index with zero lag.',
      },
      {
        icon: 'sparkles-outline',
        title: 'Natural Language Semantic Discovery',
        desc: 'Find files by concept and meaning (e.g., "tax invoice from last month" or "rent agreement") powered by local 384-dim ONNX embeddings.',
      },
      {
        icon: 'scan-outline',
        title: 'On-Device OCR Engine',
        desc: 'Extracts and indexes text from scanned documents, paper receipts, whiteboard notes, and screenshots completely offline.',
      },
      {
        icon: 'navigate-outline',
        title: 'Occurrence Navigator',
        desc: 'Jump directly to matching words with page-by-page highlighted occurrences & multi-word query support.',
      },
    ],
    proTip: 'Use the Quick Mode pills below the search bar to switch between Quick Search, Natural Language AI, Exact Match, and Whole Word.',
  },
  {
    id: 'filemanager',
    title: 'File Manager & LAN Share',
    shortTitle: 'File Manager',
    icon: 'folder-open',
    badge: 'BUILT-IN TOOLS',
    badgeColor: '#3B82F6',
    headline: 'Full-Featured Device Storage & Wi-Fi Sharing Hub',
    description:
      'Browse internal storage and SD card directories, view PDFs with dual engines, batch copy/move files, and transfer over Wi-Fi without cables.',
    features: [
      {
        icon: 'folder-outline',
        title: 'Visual Drive & Storage Explorer',
        desc: 'Explore device directories (Downloads, Camera, Documents, WhatsApp) in List or Grid view with real image and PDF page thumbnails.',
      },
      {
        icon: 'copy-outline',
        title: 'Clipboard Engine (Copy, Move, Paste)',
        desc: 'Select single or multiple files and folders to batch Copy or Move across directories with automatic overwrite collision handling.',
      },
      {
        icon: 'wifi-outline',
        title: 'Wi-Fi / LAN Hotspot File Sharing',
        desc: 'Spin up a fast, local HTTP transfer server to download files directly to any laptop, phone, or tablet on your Wi-Fi network.',
      },
      {
        icon: 'reader-outline',
        title: 'Dual PDF Viewer',
        desc: 'Open PDFs in the high-fidelity FileLens Pro viewer with text selection and page jumps, or launch into any external installed viewer.',
      },
    ],
    proTip: 'Tap the Menu button in the top right of the home screen to jump straight to File Manager, or use the bottom action bar for instant batch operations.',
  },
  {
    id: 'cleaner',
    title: 'Space Cleaner & Optimizer',
    shortTitle: 'Space Cleaner',
    icon: 'pie-chart',
    badge: '100% OFFLINE',
    badgeColor: '#10B981',
    headline: '100% Safe Storage Cleaner & Duplicate Byte Purger',
    description:
      'Reclaim valuable phone storage by finding exact document clones, safe temporary caches, burst duplicate photos, and storage hogs.',
    features: [
      {
        icon: 'trash-bin-outline',
        title: '1-Tap Junk Cache Cleaner',
        desc: 'Instantly purge rendered PDF page thumbnail caches, camera drafts, and temporary export files without touching your original documents.',
      },
      {
        icon: 'copy-outline',
        title: 'Exact Byte Duplicate Finder',
        desc: 'Scans full SHA-256 byte hashes across device storage to identify identical duplicate copies while keeping the original safe.',
      },
      {
        icon: 'images-outline',
        title: 'Same Posture & Burst Photos',
        desc: 'Uses 9x8 perceptual dHash & Laplacian sharpness to group similar burst photos and automatically flags the sharpest "⭐ Best Shot".',
      },
      {
        icon: 'albums-outline',
        title: 'Large File Hog Scanner',
        desc: 'Quickly review and manage large videos, heavy documents, and dormant archives taking up excessive storage.',
      },
    ],
    proTip: 'In Space Cleaner, tap "Same Posture Photos" to clean redundant burst shots. Your sharpest photo is always kept safe as the Best Shot!',
  },
  {
    id: 'scanner',
    title: 'Camera & 2-in-1 ID Scanner',
    shortTitle: 'Scanner & ID',
    icon: 'camera',
    badge: '2-IN-1 A4 KYC',
    badgeColor: '#F59E0B',
    headline: 'Professional Camera & Dual-Sided ID Compositor',
    description:
      'Turn your phone camera into a high-precision scanner with auto-cropping, edge detection, perspective flattening, and ID card compositing.',
    features: [
      {
        icon: 'document-text-outline',
        title: 'Auto-Edge Camera Scanner',
        desc: 'Smart edge detection, perspective correction, shadow removal, and contrast enhancement for crisp printable documents.',
      },
      {
        icon: 'card-outline',
        title: '2-in-1 ID Card Compositor',
        desc: 'Scan Front & Back sides of Aadhaar, PAN, Voter ID, or License onto 1 standardized A4 PDF page with official KYC borders.',
      },
      {
        icon: 'copy-outline',
        title: 'Multi-Page Batch Scanning',
        desc: 'Capture multi-page receipts, contracts, and books in one continuous session and export directly into a single PDF.',
      },
      {
        icon: 'wallet-outline',
        title: 'Smart Card Wallet',
        desc: 'Organize and quickly access all your identity cards and credentials with instant OCR and 1-tap copy.',
      },
    ],
    proTip: 'Tap the floating Camera icon on the home screen to open the Document Scanner, or choose 2-in-1 ID Scan from Smart Cards.',
  },
  {
    id: 'toolkit',
    title: 'PDF Toolkit & Editor',
    shortTitle: 'PDF Tools',
    icon: 'layers-outline',
    badge: 'PRO TOOLS',
    badgeColor: '#8B5CF6',
    headline: 'Comprehensive PDF Organization & Page Editing',
    description:
      'Manage, reorganize, sign, and optimize your PDFs directly on your phone with zero third-party software.',
    features: [
      {
        icon: 'grid-outline',
        title: 'Visual Page Organizer',
        desc: 'Easily reorder, rotate, delete, or extract individual pages from multi-page PDF documents with drag-and-drop simplicity.',
      },
      {
        icon: 'download-outline',
        title: 'Export Selected Pages',
        desc: 'Pick any combination of pages and export them into a brand new PDF with clean, optimized filenames.',
      },
      {
        icon: 'pencil-outline',
        title: 'Digital Signatures & Watermarks',
        desc: 'Apply offline handwritten signatures and custom security watermarks with customizable opacity and placement.',
      },
      {
        icon: 'git-merge-outline',
        title: 'Merge & Split PDFs',
        desc: 'Combine multiple PDFs into a single file or split large documents into individual chapters for quick sharing.',
      },
    ],
    proTip: 'Open any document from Scans & Docs and tap the Organizer icon to easily rearrange pages or delete unwanted pages before sharing.',
  },
  {
    id: 'brain',
    title: 'Second Brain & Smart Cards',
    shortTitle: 'Second Brain',
    icon: 'sparkles',
    badge: 'AI BRAIN',
    badgeColor: '#EC4899',
    headline: 'Voice Plans, AI Knowledge Extraction & Reminders',
    description:
      'Organize your life with offline voice plans, automatic date/time understanding, and seamless meeting sharing from WhatsApp.',
    features: [
      {
        icon: 'mic-outline',
        title: 'Voice-First Day Planning',
        desc: 'Speak naturally in Hindi, English, or Hinglish. Automatically parsed into "One Day, One Plan" with interactive task checkboxes.',
      },
      {
        icon: 'share-social-outline',
        title: 'WhatsApp Meeting & Intent Sharing',
        desc: 'Select any meeting text or flyer in WhatsApp and tap Share to FileLensPro. Auto-extracts meeting time and schedules system alarms.',
      },
      {
        icon: 'alarm-outline',
        title: '15-Minute Pre-Reminders & Alarms',
        desc: 'Receive proactive alerts 15 minutes before deadlines so you never miss a bill due date or contract renewal.',
      },
      {
        icon: 'card-outline',
        title: 'Smart Cards Knowledge Hub',
        desc: 'Extract key document details into digital cards for instant offline search, verification, and reference.',
      },
    ],
    proTip: 'Tap and hold any WhatsApp message containing meeting details, tap Share, choose FileLensPro, and tap "Confirm Plan" — scheduled in 2 seconds!',
  },
  {
    id: 'privacy',
    title: 'Privacy & Zero-Cloud Security',
    shortTitle: 'Zero-Cloud',
    icon: 'shield-checkmark-outline',
    badge: '100% PRIVATE',
    badgeColor: '#EF4444',
    headline: 'Zero-Cloud Security & Complete Offline Privacy',
    description:
      'Your files and privacy are sacred. All OCR, database indexing, search queries, and exports remain strictly on your device.',
    features: [
      {
        icon: 'lock-closed-outline',
        title: 'Zero Cloud Uploads',
        desc: 'No cloud servers, no analytics trackers, and no external AI models reading your confidential files.',
      },
      {
        icon: 'airplane-outline',
        title: '100% Offline Capability',
        desc: 'All features work seamlessly even in airplane mode with Wi-Fi and mobile data completely disabled.',
      },
      {
        icon: 'folder-outline',
        title: 'Untouched Original Files',
        desc: 'Your files stay in their original folders; FileLensPro only indexes the searchable text metadata in encrypted local SQLite.',
      },
      {
        icon: 'shield-checkmark-outline',
        title: '100% On-Device Processing',
        desc: 'All sensitive cards, documents, and search indexes remain strictly on your local device without any cloud tracking.',
      },
    ],
    proTip: 'You can use FileLensPro in Airplane Mode anytime. Verify for yourself that all features, OCR, and exports work without internet!',
  },
];

export function TutorialModal({ visible, onClose, initialTab = 0 }: TutorialModalProps) {
  const COLORS = useThemeColors();
  const [activeTabIndex, setActiveTabIndex] = useState(initialTab);
  const currentTab = TUTORIAL_TABS[activeTabIndex] || TUTORIAL_TABS[0];
  const tabsScrollRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    if (tabsScrollRef.current) {
      tabsScrollRef.current.scrollTo({
        x: Math.max(0, activeTabIndex * 110 - 40),
        animated: true,
      });
    }
  }, [activeTabIndex]);

  const handleTabChange = (idx: number) => {
    Haptics.light();
    setActiveTabIndex(idx);
  };

  const handleNext = () => {
    Haptics.light();
    if (activeTabIndex < TUTORIAL_TABS.length - 1) {
      setActiveTabIndex(activeTabIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    Haptics.light();
    if (activeTabIndex > 0) {
      setActiveTabIndex(activeTabIndex - 1);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={16} color={COLORS.accent} />
                <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>FileLensPro Guide</Text>
              </View>
              <Text style={[styles.headerSubtitle, { color: COLORS.muted }]} numberOfLines={1}>
                Complete feature tour & productivity tips
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: COLORS.surface2 }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Interactive Category Tabs */}
          <ScrollView
            ref={tabsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScrollView}
            contentContainerStyle={styles.tabsContainer}
          >
            {TUTORIAL_TABS.map((tab, idx) => {
              const isSelected = idx === activeTabIndex;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: isSelected ? COLORS.accent : COLORS.surface2,
                      borderColor: isSelected ? COLORS.accent : COLORS.border,
                    },
                  ]}
                  onPress={() => handleTabChange(idx)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={tab.icon}
                    size={14}
                    color={isSelected ? '#FFFFFF' : COLORS.muted}
                  />
                  <Text
                    style={[
                      styles.tabChipText,
                      { color: isSelected ? '#FFFFFF' : COLORS.text },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.shortTitle}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Tab Content Area */}
          <ScrollView
            style={styles.contentScrollView}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Tab Headline Banner */}
            <View
              style={[
                styles.tabBanner,
                { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
              ]}
            >
              <View style={styles.bannerHeaderRow}>
                <View
                  style={[
                    styles.badgeContainer,
                    { backgroundColor: `${currentTab.badgeColor}20`, borderColor: currentTab.badgeColor },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: currentTab.badgeColor }]} numberOfLines={1}>
                    {currentTab.badge}
                  </Text>
                </View>
                <Text style={[styles.stepIndicator, { color: COLORS.muted }]} numberOfLines={1}>
                  {activeTabIndex + 1} of {TUTORIAL_TABS.length}
                </Text>
              </View>
              <Text style={[styles.headlineText, { color: COLORS.text }]}>
                {currentTab.headline}
              </Text>
              <Text style={[styles.descriptionText, { color: COLORS.muted }]}>
                {currentTab.description}
              </Text>
            </View>

            {/* Feature Highlights Grid */}
            <View style={styles.featuresList}>
              {currentTab.features.map((item, fIdx) => (
                <View
                  key={fIdx}
                  style={[
                    styles.featureItem,
                    { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                  ]}
                >
                  <View
                    style={[
                      styles.featureIconWrap,
                      { backgroundColor: `${COLORS.accent}15` },
                    ]}
                  >
                    <Ionicons name={item.icon} size={18} color={COLORS.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.featureTitle, { color: COLORS.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.featureDesc, { color: COLORS.muted }]}>
                      {item.desc}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Pro Tip Box */}
            <View
              style={[
                styles.proTipBox,
                {
                  backgroundColor: `${COLORS.accent}10`,
                  borderColor: `${COLORS.accent}35`,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="bulb" size={16} color="#F59E0B" />
                <Text style={[styles.proTipTitle, { color: COLORS.text }]} numberOfLines={1}>PRO TIP</Text>
              </View>
              <Text style={[styles.proTipText, { color: COLORS.text }]}>
                {currentTab.proTip}
              </Text>
            </View>
          </ScrollView>

          {/* Step Dots */}
          <View style={styles.dotsRow}>
            {TUTORIAL_TABS.map((_, dotIdx) => (
              <TouchableOpacity
                key={dotIdx}
                onPress={() => handleTabChange(dotIdx)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        dotIdx === activeTabIndex ? COLORS.accent : COLORS.border,
                      width: dotIdx === activeTabIndex ? 18 : 6,
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Bottom Action Bar */}
          <View style={[styles.footer, { borderTopColor: COLORS.border }]}>
            {/* Share App with Friends Button */}
            <TouchableOpacity
              style={[
                styles.shareBtn,
                { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
              ]}
              onPress={() => {
                Haptics.light();
                shareAppWithFriends();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social-outline" size={15} color={COLORS.accent} />
              <Text style={[styles.shareBtnText, { color: COLORS.text }]} numberOfLines={1}>Share</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
              {activeTabIndex > 0 && (
                <TouchableOpacity
                  style={[
                    styles.navBtn,
                    { backgroundColor: COLORS.surface2, borderColor: COLORS.border },
                  ]}
                  onPress={handlePrev}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.navBtnText, { color: COLORS.text }]} numberOfLines={1}>Back</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: COLORS.accent }]}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText} numberOfLines={1}>
                  {activeTabIndex === TUTORIAL_TABS.length - 1 ? 'Start Exploring' : 'Next'}
                </Text>
                {activeTabIndex < TUTORIAL_TABS.length - 1 && (
                  <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: SCREEN_HEIGHT * 0.88,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsScrollView: {
    height: 56,
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  tabsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    textAlignVertical: 'center',
    flexShrink: 0,
  },
  contentScrollView: {
    flexGrow: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  tabBanner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepIndicator: {
    fontSize: 11,
    fontWeight: '600',
  },
  headlineText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 20,
  },
  descriptionText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  featuresList: {
    gap: 8,
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  proTipBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  proTipTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  proTipText: {
    fontSize: 12,
    lineHeight: 17,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
  },
  shareBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
