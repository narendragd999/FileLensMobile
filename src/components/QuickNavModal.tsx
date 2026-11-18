import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../utils/theme';
import { NativeScaleButton } from './NativeScaleButton';
import { TutorialModal } from './TutorialModal';
import SubscriptionModal from './SubscriptionModal';
import { Haptics } from '../utils/haptics';

export interface QuickNavModalProps {
  visible: boolean;
  onClose: () => void;
}

export const QuickNavModal: React.FC<QuickNavModalProps> = ({ visible, onClose }) => {
  const COLORS = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const navigateTo = (path: any) => {
    onClose();
    setTimeout(() => {
      router.push(path);
    }, 60);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <Pressable style={styles.navModalOverlay} onPress={onClose}>
          <View
            style={[
              styles.navModalCard,
              {
                backgroundColor: COLORS.surface,
                borderColor: COLORS.border,
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.navModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.navModalHeaderBadge, { backgroundColor: COLORS.accent + '20' }]}>
                  <Ionicons name="apps" size={17} color={COLORS.accent} />
                </View>
                <View>
                  <Text style={[styles.navModalTitle, { color: COLORS.text }]}>Quick Navigation</Text>
                  <Text style={[styles.navModalSub, { color: COLORS.muted }]}>FileLens Pro Hub & Tools</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.navModalCloseBtn, { backgroundColor: COLORS.surface2 }]}
              >
                <Ionicons name="close" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            {/* Navigation Items List */}
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {/* Group 1: Storage & File Tools */}
              <Text style={[styles.navGroupLabel, { color: COLORS.muted }]}>STORAGE & FILE TOOLS</Text>

              <NativeScaleButton
                onPress={() => navigateTo('/file-manager')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Ionicons name="folder-open" size={22} color="#3B82F6" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>File Manager</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Browse drives, SD card, batch copy & WiFi share</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/file-analyser')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Ionicons name="pie-chart" size={22} color="#10B981" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Space Cleaner & Analyser</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Clean cache, exact duplicates & burst photos</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/documents')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                  <Ionicons name="documents" size={22} color="#8B5CF6" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Scans & Documents</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Indexed files, OCR documents, receipts & tags</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/doc-scanner')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Ionicons name="camera" size={22} color="#F59E0B" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Document Scanner</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Camera scanner with edge auto-crop & batch OCR</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              {/* Group 2: Knowledge & Shortcuts */}
              <Text style={[styles.navGroupLabel, { color: COLORS.muted, marginTop: 14 }]}>KNOWLEDGE & SHORTCUTS</Text>

              <NativeScaleButton
                onPress={() => navigateTo('/bookmarks')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: COLORS.accent + '20' }]}>
                  <Ionicons name="bookmark" size={22} color={COLORS.accent} />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Bookmarks</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Starred favorite files & quick reference notes</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/saved-searches')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(234, 179, 8, 0.18)' }]}>
                  <Ionicons name="star" size={22} color="#EAB308" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Saved Searches</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Frequent search queries & pinned search filters</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/cards')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(236, 72, 153, 0.18)' }]}>
                  <Ionicons name="card" size={22} color="#EC4899" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Smart Cards & Vault</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>AI knowledge cards, IDs, receipts & flashcards</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/second-brain')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.18)' }]}>
                  <Ionicons name="bulb-outline" size={22} color="#10B981" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Second Brain & Planner</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Offline voice notes, reminders & morning digest</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              {/* Group 3: App & Settings */}
              <Text style={[styles.navGroupLabel, { color: COLORS.muted, marginTop: 14 }]}>PREFERENCES & HELP</Text>

              <NativeScaleButton
                onPress={() => {
                  onClose();
                  setTimeout(() => setShowSubscriptionModal(true), 120);
                }}
                style={[styles.navItemRow, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}
                activeScale={0.97}
                hapticType="medium"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.25)' }]}>
                  <Ionicons name="sparkles" size={22} color="#F59E0B" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: '#F59E0B', fontWeight: '800' }]} numberOfLines={1}>FileLens Pro & Plans</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>₹21/mo or ₹240/yr • 30-Day Free Trial</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#F59E0B" />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => navigateTo('/settings')}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(100, 116, 139, 0.18)' }]}>
                  <Ionicons name="settings-outline" size={22} color="#64748B" />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Settings & Storage</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Theme, OCR languages & background indexing</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>

              <NativeScaleButton
                onPress={() => {
                  onClose();
                  setShowTutorialModal(true);
                }}
                style={[styles.navItemRow, { backgroundColor: COLORS.surface2, borderColor: COLORS.border, marginBottom: 8 }]}
                activeScale={0.97}
                hapticType="light"
              >
                <View style={[styles.navItemIconWrap, { backgroundColor: 'rgba(148, 163, 184, 0.18)' }]}>
                  <Ionicons name="help-circle-outline" size={22} color={COLORS.muted} />
                </View>
                <View style={styles.navItemInfo}>
                  <Text style={[styles.navItemTitle, { color: COLORS.text }]} numberOfLines={1}>Help & Tutorial Guide</Text>
                  <Text style={[styles.navItemSub, { color: COLORS.muted }]} numberOfLines={1}>Interactive guide on OCR & semantic discovery</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
              </NativeScaleButton>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Tutorial Modal */}
      <TutorialModal 
        visible={showTutorialModal} 
        onClose={() => setShowTutorialModal(false)} 
      />

      {/* Pro Subscriptions & Plans Modal */}
      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </>
  );
};

export interface HeaderMenuButtonProps {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  size?: number;
  accessibilityLabel?: string;
}

export const HeaderMenuButton: React.FC<HeaderMenuButtonProps> = ({
  onPress,
  style,
  size = 36,
  accessibilityLabel = 'Open Navigation Menu',
}) => {
  const COLORS = useThemeColors();
  const [internalModalVisible, setInternalModalVisible] = useState(false);

  const handlePress = () => {
    Haptics.light();
    if (onPress) {
      onPress();
    } else {
      setInternalModalVisible(true);
    }
  };

  return (
    <>
      <NativeScaleButton
        onPress={handlePress}
        style={[
          styles.headerMenuBtn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: COLORS.surface,
            borderColor: COLORS.border,
          },
          style,
        ]}
        accessibilityLabel={accessibilityLabel}
        hapticType="light"
        activeScale={0.9}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="apps-outline" size={18} color={COLORS.accent} />
      </NativeScaleButton>

      {/* Render internal QuickNavModal if no external handler was provided */}
      {!onPress && (
        <QuickNavModal
          visible={internalModalVisible}
          onClose={() => setInternalModalVisible(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  headerMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  navModalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  navModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    marginBottom: 10,
  },
  navModalHeaderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  navModalSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  navModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navGroupLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  navItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  navItemIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  navItemInfo: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  navItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  navItemSub: {
    fontSize: 11,
  },
});
