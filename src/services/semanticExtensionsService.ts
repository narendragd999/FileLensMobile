/**
 * semanticExtensionsService.ts
 * 
 * 100% On-Device AI Extensions powered by local MiniLM vector embeddings:
 * 1. Smart Dynamic Folders (Auto-Category Albums)
 * 2. "Related Cards" Contextual Recommendations
 * 3. Space Cleaner Semantic Duplicate Detection
 * 4. Second Brain Notes-to-Documents Auto-Connection
 * 5. Smart Expiry & Renewal Alerts
 * 6. WhatsApp Intent Auto-Routing
 */

import { generateEmbedding, cosineSimilarity } from './embeddingService';

export interface SmartCategory {
  id: string;
  label: string;
  hindi: string;
  icon: string;
  color: string;
  anchorText: string;
}

export const SMART_CATEGORIES: SmartCategory[] = [
  {
    id: 'medical',
    label: 'Medical & Health',
    hindi: 'दवाई व स्वास्थ्य',
    icon: 'medkit-outline',
    color: '#EF4444',
    anchorText: 'doctor prescription clinic hospital pharmacy medicine tablet blood test lab report medical patient treatment bill pathology rx capsule syrup dose vaccine health'
  },
  {
    id: 'vehicle',
    label: 'Vehicle & Travel',
    hindi: 'वाहन व यात्रा',
    icon: 'car-outline',
    color: '#F59E0B',
    anchorText: 'vehicle registration certificate rc car bike insurance policy pollution puc challan train flight ticket boarding pass toll pnr booking transport airline motor transport'
  },
  {
    id: 'finance',
    label: 'Finance & Bills',
    hindi: 'बिल व टैक्स',
    icon: 'receipt-outline',
    color: '#10B981',
    anchorText: 'tax invoice gst bill electricity water power utility salary slip form 16 bank statement transaction amount payment due receipt loan account balance credit payment'
  },
  {
    id: 'govt_id',
    label: 'Govt IDs & Proofs',
    hindi: 'सरकारी पहचान पत्र',
    icon: 'id-card-outline',
    color: '#3B82F6',
    anchorText: 'aadhaar card unique identification authority of india pan card income tax department passport republic driving license election voter election-commission birth certificate domicile citizenship'
  },
  {
    id: 'education',
    label: 'Education & Career',
    hindi: 'शिक्षा व परीक्षा',
    icon: 'school-outline',
    color: '#8B5CF6',
    anchorText: 'degree marksheet diploma exam admit card hall ticket roll number university college school certificate score grade result syllabus student marks institution'
  },
  {
    id: 'personal',
    label: 'Personal & Notes',
    hindi: 'व्यक्तिगत नोट्स',
    icon: 'document-text-outline',
    color: '#06B6D4',
    anchorText: 'personal diary agreement contract warranty rent lease affidavit letter memorandum notice memo reminder secret credentials password note document'
  }
];

/**
 * Unified, deterministic classifier for Smart Categories.
 * Evaluates card name, custom_tag, and ocr_text so folder card counts
 * and filtered cards view are always 100% synchronized and consistent.
 */
export function getCardSmartCategory(c: { name?: string; custom_tag?: string; ocr_text?: string }): string {
  const name = (c.name || '').toLowerCase();
  const tag = (c.custom_tag || '').toLowerCase();
  const ocr = (c.ocr_text || '').toLowerCase();
  const combined = `${name} ${tag} ${ocr}`;

  // 1. Govt IDs & Proofs
  if (
    tag.includes('id') ||
    tag.includes('aadhaar') ||
    tag.includes('pan') ||
    tag.includes('passport') ||
    tag.includes('license') ||
    tag.includes('licence') ||
    tag.includes('voter') ||
    tag.includes('kyc') ||
    combined.includes('aadhaar') ||
    combined.includes('pan card') ||
    combined.includes('passport') ||
    combined.includes('voter id') ||
    combined.includes('election commission') ||
    combined.includes('driving license') ||
    combined.includes('driving licence') ||
    combined.includes('republic of india') ||
    combined.includes('income tax department') ||
    combined.includes('unique identification') ||
    combined.includes('domicile') ||
    combined.includes('citizenship') ||
    combined.includes('identity card') ||
    name.includes('aadhaar') ||
    name.includes('pan') ||
    name.includes('passport') ||
    name.includes('license')
  ) {
    return 'govt_id';
  }

  // 2. Education & Career
  if (
    tag.includes('education') ||
    tag.includes('degree') ||
    tag.includes('marksheet') ||
    tag.includes('school') ||
    tag.includes('college') ||
    tag.includes('exam') ||
    combined.includes('degree') ||
    combined.includes('marksheet') ||
    combined.includes('mark sheet') ||
    combined.includes('diploma') ||
    combined.includes('admit card') ||
    combined.includes('hall ticket') ||
    combined.includes('roll number') ||
    combined.includes('roll no') ||
    combined.includes('university') ||
    combined.includes('college') ||
    combined.includes('school') ||
    combined.includes('student') ||
    combined.includes('certificate') ||
    combined.includes('education') ||
    combined.includes('semester') ||
    combined.includes('cbse') ||
    combined.includes('icse') ||
    combined.includes('board exam') ||
    combined.includes('exam') ||
    name.includes('marksheet') ||
    name.includes('degree') ||
    name.includes('diploma') ||
    name.includes('certificate') ||
    name.includes('school') ||
    name.includes('college') ||
    name.includes('student')
  ) {
    return 'education';
  }

  // 3. Medical & Health
  if (
    tag.includes('medical') ||
    tag.includes('prescription') ||
    tag.includes('doctor') ||
    tag.includes('health') ||
    combined.includes('doctor') ||
    combined.includes('prescription') ||
    combined.includes('hospital') ||
    combined.includes('clinic') ||
    combined.includes('pharmacy') ||
    combined.includes('medicine') ||
    combined.includes('blood test') ||
    combined.includes('lab report') ||
    combined.includes('pathology') ||
    combined.includes('patient') ||
    combined.includes('tablet') ||
    combined.includes('syrup') ||
    combined.includes('capsule') ||
    combined.includes('rx') ||
    combined.includes('vaccine') ||
    combined.includes('health') ||
    combined.includes('medical') ||
    name.includes('prescription') ||
    name.includes('doctor') ||
    name.includes('medical') ||
    name.includes('lab')
  ) {
    return 'medical';
  }

  // 4. Vehicle & Travel
  if (
    tag.includes('vehicle') ||
    tag.includes('rc') ||
    tag.includes('insurance') ||
    tag.includes('ticket') ||
    combined.includes('vehicle') ||
    combined.includes('registration certificate') ||
    combined.includes('rc ') ||
    combined.includes('car ') ||
    combined.includes('bike ') ||
    combined.includes('motor') ||
    combined.includes('transport') ||
    combined.includes('pollution') ||
    combined.includes('puc') ||
    combined.includes('challan') ||
    combined.includes('flight') ||
    combined.includes('airline') ||
    combined.includes('boarding pass') ||
    combined.includes('train ticket') ||
    combined.includes('railway') ||
    combined.includes('irctc') ||
    combined.includes('pnr') ||
    combined.includes('travel ticket') ||
    combined.includes('toll') ||
    name.includes('rc') ||
    name.includes('insurance') ||
    name.includes('ticket')
  ) {
    return 'vehicle';
  }

  // 5. Finance & Bills
  if (
    tag.includes('bill') ||
    tag.includes('receipt') ||
    tag.includes('invoice') ||
    tag.includes('tax') ||
    tag.includes('finance') ||
    combined.includes('invoice') ||
    combined.includes('gst') ||
    combined.includes('bill') ||
    combined.includes('receipt') ||
    combined.includes('tax') ||
    combined.includes('salary') ||
    combined.includes('payslip') ||
    combined.includes('form 16') ||
    combined.includes('bank statement') ||
    combined.includes('passbook') ||
    combined.includes('account number') ||
    combined.includes('ifsc') ||
    combined.includes('credit card') ||
    combined.includes('debit card') ||
    combined.includes('payment') ||
    combined.includes('electricity bill') ||
    combined.includes('water bill') ||
    combined.includes('utility') ||
    combined.includes('due date') ||
    combined.includes('finance') ||
    name.includes('bill') ||
    name.includes('receipt') ||
    name.includes('invoice')
  ) {
    return 'finance';
  }

  // 6. Personal & Notes (Default fallback)
  return 'personal';
}

// In-memory cache for category vectors
let categoryVectorsCache: Map<string, Float32Array> | null = null;

export async function getCategoryVectors(): Promise<Map<string, Float32Array>> {
  if (categoryVectorsCache) return categoryVectorsCache;
  const map = new Map<string, Float32Array>();
  for (const cat of SMART_CATEGORIES) {
    const vec = await generateEmbedding(cat.anchorText);
    map.set(cat.id, vec);
  }
  categoryVectorsCache = map;
  return map;
}

/**
 * Classifies a card or document into one of the Smart Categories using MiniLM embeddings.
 */
export async function classifyContent(
  text: string
): Promise<{ category: SmartCategory; confidence: number }> {
  if (!text || !text.trim()) {
    return { category: SMART_CATEGORIES[SMART_CATEGORIES.length - 1], confidence: 0.1 };
  }

  const vectors = await getCategoryVectors();
  const textVector = await generateEmbedding(text.slice(0, 500));

  let bestCat = SMART_CATEGORIES[0];
  let highestScore = -1;

  for (const cat of SMART_CATEGORIES) {
    const catVec = vectors.get(cat.id);
    if (catVec) {
      const sim = cosineSimilarity(textVector, catVec);
      if (sim > highestScore) {
        highestScore = sim;
        bestCat = cat;
      }
    }
  }

  return { category: bestCat, confidence: Math.max(0, highestScore) };
}

export interface RelatedCardMatch {
  card: any;
  similarity: number;
  reason: string;
}

/**
 * Finds contextually related cards for a target card based on meaning similarity.
 */
export async function findRelatedCards(
  targetCard: { id: number; name?: string; ocr_text?: string; custom_tag?: string },
  allCards: Array<{ id: number; name: string; ocr_text?: string; custom_tag?: string; [key: string]: any }>,
  limit = 3,
  minSimilarity = 0.38
): Promise<RelatedCardMatch[]> {
  const targetText = `${targetCard.custom_tag || ''} ${targetCard.name || ''} ${(targetCard.ocr_text || '').slice(0, 400)}`.trim();
  if (!targetText) return [];

  const targetVector = await generateEmbedding(targetText);
  const candidates: RelatedCardMatch[] = [];

  for (const card of allCards) {
    if (card.id === targetCard.id) continue;
    const cardText = `${card.custom_tag || ''} ${card.name || ''} ${(card.ocr_text || '').slice(0, 400)}`.trim();
    if (!cardText) continue;

    const cardVector = await generateEmbedding(cardText);
    const sim = cosineSimilarity(targetVector, cardVector);

    if (sim >= minSimilarity) {
      let reason = 'Semantically related content';
      if (sim > 0.65) reason = 'Strong conceptual match';
      else if (sim > 0.50) reason = 'Related topic or category';

      candidates.push({ card, similarity: sim, reason });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, limit);
}

export interface SemanticDuplicateGroup {
  primary: { id: any; name: string; uri: string; size?: number; [key: string]: any };
  duplicates: Array<{ id: any; name: string; uri: string; similarity: number; size?: number; [key: string]: any }>;
}

/**
 * Finds semantically duplicate documents/cards where text content is >= 90% identical in meaning.
 */
export async function findSemanticDuplicates(
  items: Array<{ id: any; name: string; uri: string; ocr_text?: string; content_text?: string; size?: number; modified?: any; [key: string]: any }>,
  threshold = 0.90
): Promise<SemanticDuplicateGroup[]> {
  const validItems = items.filter(it => (it.ocr_text && it.ocr_text.trim().length > 30) || (it.content_text && it.content_text.trim().length > 30));
  if (validItems.length < 2) return [];

  // Precompute vectors
  const itemVectors = new Map<any, Float32Array>();
  for (const it of validItems) {
    const text = (it.ocr_text || it.content_text || '').slice(0, 600);
    const vec = await generateEmbedding(text);
    itemVectors.set(it.id, vec);
  }

  const visited = new Set<any>();
  const groups: SemanticDuplicateGroup[] = [];

  for (let i = 0; i < validItems.length; i++) {
    const itemA = validItems[i];
    if (visited.has(itemA.id)) continue;

    const vecA = itemVectors.get(itemA.id);
    if (!vecA) continue;

    const dups: Array<{ id: any; name: string; uri: string; similarity: number; size?: number; [key: string]: any }> = [];

    for (let j = i + 1; j < validItems.length; j++) {
      const itemB = validItems[j];
      if (visited.has(itemB.id)) continue;

      const vecB = itemVectors.get(itemB.id);
      if (!vecB) continue;

      const sim = cosineSimilarity(vecA, vecB);
      if (sim >= threshold) {
        dups.push({ ...itemB, similarity: sim });
        visited.add(itemB.id);
      }
    }

    if (dups.length > 0) {
      visited.add(itemA.id);
      groups.push({ primary: itemA, duplicates: dups });
    }
  }

  return groups;
}

export interface NoteCardLink {
  card: any;
  similarity: number;
  highlightText: string;
}

/**
 * Connects Second Brain text notes to related indexed cards.
 */
export async function findRelevantCardsForNote(
  noteText: string,
  allCards: Array<{ id: number; name: string; ocr_text?: string; custom_tag?: string; [key: string]: any }>,
  minSimilarity = 0.40,
  limit = 2
): Promise<NoteCardLink[]> {
  if (!noteText || !noteText.trim()) return [];
  const noteVector = await generateEmbedding(noteText.slice(0, 400));
  const matches: NoteCardLink[] = [];

  for (const card of allCards) {
    const cardText = `${card.custom_tag || ''} ${card.name || ''} ${(card.ocr_text || '').slice(0, 400)}`.trim();
    if (!cardText) continue;

    const cardVector = await generateEmbedding(cardText);
    const sim = cosineSimilarity(noteVector, cardVector);

    if (sim >= minSimilarity) {
      matches.push({
        card,
        similarity: sim,
        highlightText: card.custom_tag || card.name || 'Relevant Card'
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, limit);
}

export interface ExpiryDetectionResult {
  hasExpiry: boolean;
  status: 'expired' | 'expiring_soon' | 'valid' | 'none';
  expiryDateStr?: string;
  daysRemaining?: number;
  badgeLabel?: string;
  badgeColor?: string;
}

/**
 * Detects upcoming expiry or renewal dates on cards (Insurance, Passport, Licenses, Bills).
 */
export function detectCardExpiry(card: { name?: string; ocr_text?: string; custom_tag?: string }): ExpiryDetectionResult {
  const combined = `${card.name || ''} ${card.custom_tag || ''} ${card.ocr_text || ''}`.toLowerCase();

  const isExpiringDocType =
    combined.includes('insurance') ||
    combined.includes('policy') ||
    combined.includes('valid') ||
    combined.includes('expiry') ||
    combined.includes('expires') ||
    combined.includes('due date') ||
    combined.includes('puc') ||
    combined.includes('passport') ||
    combined.includes('license') ||
    combined.includes('bill');

  if (!isExpiringDocType) {
    return { hasExpiry: false, status: 'none' };
  }

  const regexPatterns = [
    /(?:valid\s*(?:till|upto|up\s*to|through|to)|exp(?:iry|ire)?\s*(?:date)?|due\s*date|renewal\s*date)\s*[:\-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    /(\d{1,2}[./-]\d{1,2}[./-]\d{4})/g
  ];

  let rawDateMatch: string | null = null;
  const match1 = combined.match(regexPatterns[0]);
  if (match1 && match1[1]) {
    rawDateMatch = match1[1];
  }

  if (!rawDateMatch) {
    return { hasExpiry: false, status: 'none' };
  }

  try {
    const parts = rawDateMatch.replace(/\./g, '-').replace(/\//g, '-').split('-');
    let parsedDate: Date | null = null;

    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        parsedDate = new Date(y, m, d);
      } else if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        parsedDate = new Date(y, m, d);
      }
    }

    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return { hasExpiry: true, status: 'valid', expiryDateStr: rawDateMatch };
    }

    const today = new Date();
    const diffTime = parsedDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return {
        hasExpiry: true,
        status: 'expired',
        daysRemaining,
        expiryDateStr: rawDateMatch,
        badgeLabel: `Expired ${Math.abs(daysRemaining)}d ago`,
        badgeColor: '#EF4444'
      };
    } else if (daysRemaining <= 30) {
      return {
        hasExpiry: true,
        status: 'expiring_soon',
        daysRemaining,
        expiryDateStr: rawDateMatch,
        badgeLabel: `Expires in ${daysRemaining}d`,
        badgeColor: '#F59E0B'
      };
    } else {
      return {
        hasExpiry: true,
        status: 'valid',
        daysRemaining,
        expiryDateStr: rawDateMatch,
        badgeLabel: `Valid (${daysRemaining}d left)`,
        badgeColor: '#10B981'
      };
    }
  } catch {
    return { hasExpiry: true, status: 'valid', expiryDateStr: rawDateMatch };
  }
}

/**
 * Classifies whether shared text/media belongs in Second Brain (action/meeting) or Card Vault (document/ID).
 */
export async function classifyIncomingIntent(
  text: string,
  hasImage: boolean
): Promise<{ target: 'brain' | 'card'; confidence: number; suggestedTitle: string }> {
  if (!text && hasImage) {
    return { target: 'card', confidence: 0.9, suggestedTitle: 'Scanned Document' };
  }

  const actionAnchor = 'meeting schedule tomorrow at reminder call discuss task appointment zoom google meet calendar time alarm deadline todo plan webinar';
  const cardAnchor = 'identity aadhaar pan card invoice receipt tax statement account passport vehicle license ticket certificate voucher bill';

  const actionVec = await generateEmbedding(actionAnchor);
  const cardVec = await generateEmbedding(cardAnchor);
  const textVec = await generateEmbedding(text.slice(0, 400));

  const actionSim = cosineSimilarity(textVec, actionVec);
  const cardSim = cosineSimilarity(textVec, cardVec);

  const cleanTitle = text.slice(0, 35).replace(/\n/g, ' ').trim();

  if (actionSim > cardSim + 0.05) {
    return { target: 'brain', confidence: actionSim, suggestedTitle: cleanTitle || 'Voice First Plan' };
  } else {
    return { target: 'card', confidence: cardSim, suggestedTitle: cleanTitle || 'Document Card' };
  }
}
