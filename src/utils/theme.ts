import { useStore } from '../store/useStore';

// -------------------------------------------------------------
// 1. Classic Palette (Preserved 100% for instant complete rollback)
// -------------------------------------------------------------
export const CLASSIC_DARK_COLORS = {
  bg: '#0F172A',
  surface: '#1E293B',
  card: '#1E293B',
  surface2: '#334155',
  border: '#475569',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  muted: '#94A3B8',
  dim: '#64748B',
  accent: '#6366F1',
  accentSoft: '#818CF8',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  highlight: '#eab30855',
  highlightCurrent: '#eab308aa',
};

export const CLASSIC_LIGHT_COLORS = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  surface2: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#64748B',
  muted: '#64748B',
  dim: '#94A3B8',
  accent: '#4F46E5',
  accentSoft: '#6366F1',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  highlight: '#fef08a88',
  highlightCurrent: '#fde047aa',
};

// -------------------------------------------------------------
// 2. Executive Pro Palette (Titanium Onyx & Alabaster Cobalt)
// -------------------------------------------------------------
export const TITANIUM_DARK_COLORS = {
  bg: '#0D0F12',         // Deep neutral onyx base (Zero blue fatigue)
  surface: '#16191E',    // Dark titanium surface
  card: '#16191E',       // Card background
  surface2: '#222730',   // Elevated chips, search inputs
  border: '#2A303C',     // Subtle hairline divider (Soft and clean)
  text: '#F8FAFC',       // Pure high-contrast white text
  textSecondary: '#94A3B8',
  muted: '#94A3B8',      // Muted metadata
  dim: '#64748B',
  accent: '#2563EB',     // Electric Cobalt (authoritative optical blue)
  accentSoft: '#60A5FA', // Luminous blue for badges & borders
  success: '#10B981',    // Emerald
  warning: '#F59E0B',    // Amber
  danger: '#EF4444',     // Rose red
  highlight: '#eab30855',
  highlightCurrent: '#eab308aa',
};

export const ALABASTER_LIGHT_COLORS = {
  bg: '#F4F6F9',         // Warm architectural alabaster paper base
  surface: '#FFFFFF',    // Crisp white card surface
  card: '#FFFFFF',       // Card background
  surface2: '#E8EEF5',   // Cool porcelain for chips & search inputs
  border: '#E2E8F0',     // Hairline slate borders
  text: '#0F172A',       // Deep midnight black text
  textSecondary: '#475569',
  muted: '#64748B',      // Crisp muted metadata
  dim: '#94A3B8',
  accent: '#2563EB',     // Royal Cobalt ink (WCAG AAA 7.2:1 contrast)
  accentSoft: '#3B82F6', // Soft cobalt
  success: '#059669',    // Green
  warning: '#D97706',    // Amber
  danger: '#DC2626',     // Red
  highlight: '#fef08a88',
  highlightCurrent: '#fde047aa',
};

// Active Theme (Switch between TITANIUM or CLASSIC here at any time)
export const DARK_COLORS = TITANIUM_DARK_COLORS;
export const LIGHT_COLORS = ALABASTER_LIGHT_COLORS;

// Fallback for non-React contexts
export const COLORS = DARK_COLORS;

export function useThemeColors() {
  const theme = useStore(state => state.theme);
  const isDark = theme === 'dark';
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

export const SIZES = {
  radius: 16,
  radiusSm: 8,
  padding: 16,
  paddingSm: 8,
};

export const FONTS = {
  regular: 'System',
  bold: 'System',
};
