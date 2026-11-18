import { Share } from 'react-native';

export const SHARE_APP_MESSAGE = 
  '🔍 *FileLensPro* — Smart On-Device Document Search, Second Brain & Space Cleaner\n\n' +
  'The ultimate 100% offline document search, scanner, voice planner & storage optimizer for Android! Search inside PDFs, photos, receipts, invoices, Word docs & spreadsheets with lightning speed.\n\n' +
  '✨ *Top Features:*\n' +
  '• ⚡ *Instant Deep Search*: Full-text and OCR search inside PDFs, DOCX, XLSX, and Photos with occurrence highlighting & regex.\n' +
  '• 🧠 *Voice-First Second Brain*: Speak your thoughts offline in Hindi, English or Hinglish! Auto-organizes tasks into "One Day, One Plan" with recurring Awareness Bell reminders.\n' +
  '• 📲 *WhatsApp Meeting & Intent Sharing*: Select any meeting, appointment, or flyer in WhatsApp, tap Share to FileLensPro, and instantly auto-extract date/time to schedule alarm reminders!\n' +
  '• 🧹 *Space Cleaner & Optimizer*: 1-tap junk cache cleaner, exact SHA-256 duplicate document finder, and same-posture burst photo clustering with Best Shot detection.\n' +
  '• 📷 *Camera & 2-in-1 ID Scanner*: Auto edge detection & front+back ID compositing onto 1 single A4 PDF page with official KYC borders.\n' +
  '• 💼 *Smart Card Wallet*: Secure PIN/Biometric-protected vault for all identity cards.\n' +
  '• 📑 *Advanced PDF Toolkit*: Reorder, rotate, delete, split, extract, and merge PDF pages effortlessly.\n' +
  '• ✍️ *Digital Signatures & Watermarks*: Add offline signatures and custom security watermarks to any document.\n' +
  '• 🔒 *100% Private & Offline*: Zero cloud uploads, zero tracking — your data never leaves your phone!\n\n' +
  '📲 *Download FileLensPro today:*\n' +
  'https://play.google.com/store/apps/details?id=com.filelenspro.app';

export async function shareAppWithFriends(): Promise<boolean> {
  try {
    const result = await Share.share({
      title: 'FileLensPro — Offline Document Search & Scanner',
      message: SHARE_APP_MESSAGE,
    });
    return result.action === Share.sharedAction;
  } catch (error) {
    console.warn('[shareAppWithFriends] Error sharing:', error);
    return false;
  }
}
