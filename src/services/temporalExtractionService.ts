/**
 * temporalExtractionService.ts — On-device Temporal, Date, Time & Action Item Extraction
 *
 * Comprehensive, privacy-preserving, rule-based extraction for
 * English, Hindi, and code-switched Hinglish voice notes.
 *
 * Supports:
 *  - Explicit calendar dates (e.g. "14 September 2026", "14th Sep", "14/09/2026", "September 14")
 *  - Transliterated & phonetic terms (e.g. "cal" / "kal" / "tomorrow", "parson", "subah", "shaam")
 *  - Named time of day ("morning mein", "in the morning", "subah", "dopahar", "shaam", "raat")
 *  - Explicit clock times ("9 am", "11:30", "5 baje", "10 baje shaam")
 *  - Hindi & English action items ("Udaipur jana hai", "meeting with Sharmaji", "appointment hai")
 *  - Explicit reminder & notification requests ("remind bhi karvao", "notification bhejo")
 *
 * Output:
 *  - temporalClass: 'today' | 'future' | 'historical'
 *  - resolvedDatetime: ISO 8601 string or null
 *  - actionItems: string[]
 *  - isHighConfidenceReminder: boolean
 */

import {
  segmentTextIntoSemanticClauses,
  classifySemanticClauses,
} from './semanticAiModelService';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  dueDatetime?: string | null;
}

export interface TemporalExtractionResult {
  temporalClass: 'today' | 'future' | 'historical';
  resolvedDatetime: string | null;
  actionItems: string[];
  isHighConfidenceReminder: boolean;
  enableEvePlanningReminder?: boolean;
  checklistItems?: ChecklistItem[];
}

/**
 * Universal Normalizer for Action Items & Checklists.
 * Guarantees 100% backward compatibility with legacy string arrays,
 * while supporting rich interactive ChecklistItem objects with IDs, completion flags, and due dates.
 */
export function normalizeActionItems(items: any): ChecklistItem[] {
  if (!items) return [];
  let parsed: any[] = [];
  if (typeof items === 'string') {
    try {
      parsed = JSON.parse(items);
    } catch {
      return items.trim() ? [{ id: '1', text: items.trim(), completed: false, dueDatetime: null }] : [];
    }
  } else if (Array.isArray(items)) {
    parsed = items;
  } else if (typeof items === 'object') {
    parsed = [items];
  }

  return parsed.map((item, idx) => {
    if (typeof item === 'string') {
      const isDone = item.startsWith('[DONE] ');
      const cleanText = isDone ? item.replace('[DONE] ', '').trim() : item.trim();
      return {
        id: String(idx + 1),
        text: cleanText,
        completed: isDone,
        dueDatetime: null,
      };
    }
    if (item && typeof item === 'object') {
      const rawText = String(item.text || '').trim();
      const isDone = Boolean(item.completed) || rawText.startsWith('[DONE] ');
      const cleanText = rawText.startsWith('[DONE] ') ? rawText.replace('[DONE] ', '').trim() : rawText;
      return {
        id: String(item.id || idx + 1),
        text: cleanText,
        completed: isDone,
        dueDatetime: item.dueDatetime || null,
      };
    }
    return { id: String(idx + 1), text: String(item), completed: false, dueDatetime: null };
  }).filter(it => it.text.length > 0);
}

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0, janvari: 0, 'जनवरी': 0,
  february: 1, feb: 1, farvari: 1, 'फ़रवरी': 1, 'फरवरी': 1,
  march: 2, mar: 2, 'मार्च': 2,
  april: 3, apr: 3, aprail: 3, 'अप्रैल': 3,
  may: 4, mai: 4, 'मई': 4,
  june: 5, jun: 5, 'जून': 5,
  july: 6, jul: 6, 'जुलाई': 6,
  august: 7, aug: 7, agast: 7, 'अगस्त': 7,
  september: 8, sep: 8, sept: 8, sitambar: 8, sitambr: 8, 'सितंबर': 8, 'सितम्बर': 8,
  october: 9, oct: 9, aktubar: 9, 'अक्टूबर': 9,
  november: 10, nov: 10, navambar: 10, 'नवंबर': 10, 'नवम्बर': 10,
  december: 11, dec: 11, disambar: 11, 'दिसंबर': 11, 'दिसम्बर': 11,
};

const DAYS_OF_WEEK: Record<string, number> = {
  sunday: 0, itwar: 0, ravivar: 0, ravivaar: 0, itvaar: 0, 'रविवार': 0, 'इतवार': 0,
  monday: 1, somvaar: 1, somwar: 1, sombar: 1, 'सोमवार': 1,
  tuesday: 2, mangalvaar: 2, mangalwar: 2, 'मंगलवार': 2,
  wednesday: 3, budhvaar: 3, budhwar: 3, 'बुधवार': 3,
  thursday: 4, guruvaar: 4, guruwar: 4, brihaspativar: 4, veervar: 4, 'गुरुवार': 4, 'बृहस्पतिवार': 4, 'वीरवार': 4,
  friday: 5, shukravaar: 5, shukrawar: 5, 'शुक्रवार': 5, juma: 5, 'जुमा': 5,
  saturday: 6, shanivaar: 6, shaniwar: 6, 'शनिवार': 6, hafta: 6, 'हफ्ता': 6,
};

/**
 * Universal Semantic Action & To-Do Item Extractor
 * Handles spoken notes, WhatsApp forwards, OCR scanned documents, circulars, memos & prose.
 * Features:
 * - Unwraps multi-line bullet/numbered points into continuous complete sentences.
 * - Unwraps soft line breaks from narrow OCR/mobile text into coherent sentences.
 * - Filters document noise: headers, salutations, references, closings, signatures, timestamps.
 * - Never strips internal words or month names (preserves full semantic fidelity).
 */
export function extractSemanticActionItems(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const cleanInput = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!cleanInput) return [];

  const rawLines = cleanInput.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return [];

  const cleanItem = (str: string) => str.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Forwarded markers
  const isForwarded = (l: string) =>
    /^(?:(?:forwarded|forwaded|फॉरवर्डेड)(?:\s+message)?|\[(?:forwarded|फॉरवर्डेड)\])$/ui.test(l);

  // 2. Salutations / Greetings (Hindi & English)
  const isGreeting = (l: string) =>
    /^(?:सम्मानित|आदरणीय|माननीय|प्रिय|श्रीमान|श्रीमती|महोदय|महोदया|dear|respected|hello|hi|hey|good\s+(?:morning|afternoon|evening))\b/ui.test(l) && l.length < 60;

  // 3. Document / OCR Headers & Meta lines
  const isHeaderOrMeta = (l: string) =>
    /^(?:विषय|subject|समय|time|दिनांक|तारीख|date|स्थान|venue|meeting id|नोट|note|ref(?:\.|\s+no)?|circular\s+no|पत्रांक|क्रमांक|आदेश\s*क्रमांक|संदर्भ)\s*[:-]/ui.test(l) ||
    /^(?:एजेंडा बिंदु|agenda points?|कार्यसूची|agenda|minutes of meeting|बैठक की कार्यसूची)\s*[:-]?$/ui.test(l) ||
    ((/^(?:government of|goverment of|कार्यालय|निदेशालय|department of|ministry of|office of)(?:$|[\s,;!।\-]|\P{L})/ui.test(l)) && l.length < 80);

  // 4. Closings, Signoffs & Footers (Hindi & English)
  const isClosing = (l: string) =>
    /^(?:सादर|सस्नेह|धन्यवाद|भवदीय|शुभेच्छु|जय हिन्द|जय भारत|वंदे मातरम|regards|warm regards|best regards|kind regards|thanks & regards|thanks and regards|thanks|thank you|sincerely|yours faithfully|yours truly|yours)\b/ui.test(l) ||
    /^(?:सादर|सस्नेह|धन्यवाद|भवदीय|शुभेच्छु|जय हिन्द|जय भारत|वंदे मातरम)(?:[\s,;!।\-]|$)/ui.test(l);

  // 5. Signature / Designation / Timestamp / Page No artifacts
  const isSignatureOrNoise = (l: string) =>
    /^\d{1,2}:\d{2}(?:\s*(?:am|pm|baje|बजे))?$/ui.test(l) ||
    /^(?:page\s+\d+|\d+\s*\/\s*\d+|-\s*\d+\s*-)$/ui.test(l) ||
    /^[-_=*~]{3,}$/.test(l) ||
    /^(?:प्रदेश\s*(?:महा)?सचिव|अध्यक्ष|उपाध्यक्ष|महासचिव|सचिव|प्रबंधक|निदेशक|संयोजक|coordinator|secretary|president|vice\s+president|general\s+secretary|manager|director)$/ui.test(l);

  // 6. List Marker Regex:
  // Numbers: 1. / 1) / (1) / 1 - / 1: / [1]
  // Letters: a. / a) / (a) / A.
  // Roman numerals: i. / ii. / (i) / I.
  // Devanagari numbers: १. / २)
  // Bullets: •, -, *, ⁃, ‣, ►, ✔, ✓, etc.
  const listItemStartRegex = /^(?:(?:\(?\d{1,2}[.)\]:\-]|(?:\([a-zA-Z0-9]\))|[a-zA-Z][.)\-]|(?:\(?[ivxIVX]+[.)\-]\)?)|[०-९]{1,2}[.)\]:\-])\s*|[•\-*⁃‣►✔✓\u2022\u2023\u25E6\u2043\u2219]\s+)/u;

  const hasListMarkers = rawLines.some(l => listItemStartRegex.test(l));

  if (hasListMarkers) {
    const items: string[] = [];
    let currentItem = '';
    let inListSection = false;
    let hitClosing = false;

    for (const line of rawLines) {
      if (hitClosing) break;

      if (isClosing(line)) {
        if (currentItem.trim().length > 0) {
          items.push(cleanItem(currentItem));
          currentItem = '';
        }
        hitClosing = true;
        break;
      }

      if (isForwarded(line) || isGreeting(line) || isHeaderOrMeta(line)) {
        continue;
      }

      if (listItemStartRegex.test(line)) {
        if (currentItem.trim().length > 0) {
          items.push(cleanItem(currentItem));
        }
        currentItem = line;
        inListSection = true;
      } else if (inListSection) {
        if (isSignatureOrNoise(line)) {
          hitClosing = true;
          break;
        }
        // Unwrap multi-line wrapped sentence into a continuous full sentence
        currentItem += ' ' + line;
      }
    }

    if (currentItem.trim().length > 0) {
      items.push(cleanItem(currentItem));
    }

    const filtered = items.filter(it => it.length >= 4);
    if (filtered.length > 0) {
      return filtered;
    }
  }

  // --- Prose & OCR Paragraph Handling ---
  const contentLines: string[] = [];
  let reachedFooter = false;

  for (const line of rawLines) {
    if (reachedFooter) break;
    if (isClosing(line) || isSignatureOrNoise(line)) {
      reachedFooter = true;
      break;
    }
    if (isForwarded(line) || isGreeting(line) || isHeaderOrMeta(line)) {
      continue;
    }
    contentLines.push(line);
  }

  if (contentLines.length === 0) {
    return [cleanItem(cleanInput)];
  }

  // Soft line unwrap for OCR & narrow screens
  let unwrappedText = '';
  for (let i = 0; i < contentLines.length; i++) {
    const l = contentLines[i];
    unwrappedText += (unwrappedText && !/[।!?.:;\-]$/u.test(unwrappedText) ? ' ' : '\n') + l;
  }

  // Sentence segmentation
  const sentenceDelim = /(?:[।!?]|\.\s+|\n{2,}|\s*(?:और फिर|उसके बाद|इसके अलावा|साथ ही साथ|and then|after that)\s*)/u;
  const rawSegments = unwrappedText
    .split(sentenceDelim)
    .map(s => s.trim())
    .filter(s => s.length >= 5);

  const cleaned = rawSegments.map(seg => {
    let s = seg
      .replace(/^(?:रिमाइंडर\s*सेट\s*करो|रिमाइंडर\s*लगाओ|अलार्म\s*लगाओ|याद\s*दिलाओ|याद\s*दिलाना|सेट\s*करो|remind me to|set reminder for|set a reminder)\s*/ui, '')
      .replace(/^(?:kal|cal|कल|parso|parson|परसों|tarso|तरसों|narso|नरसों|aaj|आज|tomorrow|today)\s+(?:ko\s+)?/ui, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length >= 3) {
      s = s.charAt(0).toUpperCase() + s.slice(1);
    }
    return s;
  }).filter(s => s.length >= 3);

  // Check if it is an Admit Card / Exam / Hall Ticket / Interview Letter
  const isAdmitCard = /(?:admit\s*card|hall\s*ticket|call\s*letter|roll\s*no|प्रवेश\s*पत्र)/i.test(cleanInput);
  if (isAdmitCard) {
    const subjectMatch = cleanInput.match(/(?:subject|paper|post|exam(?:ination)?(?:\s*name)?|course)[\s:=-]+([^\n\r,;]+)/i);
    const examHeaderMatch = cleanInput.match(/([^\n\r]*(?:examination|exam|recruitment|test|olympiad)[^\n\r]*)/i);
    if (subjectMatch && subjectMatch[1].trim().length >= 3) {
      return [`${subjectMatch[1].trim()} Examination`];
    } else if (examHeaderMatch && examHeaderMatch[1].trim().length >= 4) {
      return [cleanItem(examHeaderMatch[1].trim())];
    }
    return ['Admit Card Examination'];
  }

  // Multilingual Semantic Clause Decomposition & Intent Classification
  const semanticClauses = segmentTextIntoSemanticClauses(unwrappedText);
  const semanticResult = classifySemanticClauses(semanticClauses);
  if (semanticResult.todos.length > 0) {
    return semanticResult.todos;
  }

  return cleaned.length > 0 ? cleaned : [cleanItem(cleanInput)];
}

export function parseDateFromSnippet(
  snippet: string,
  now: Date,
  targetHour: number = 10,
  targetMinute: number = 0
): { date: Date; isExplicit: boolean } | null {
  if (!snippet) return null;
  const normalized = snippet.toLowerCase().trim();
  const mPattern = Object.keys(MONTH_MAP).sort((a, b) => b.length - a.length).join('|');

  // Pattern A: Year-First e.g. "2026-Sep-22", "2026-09-22", "2026/09/22"
  const dateRegexYearFirst = new RegExp(
    `(?:^|[\\s(\\[,;:|\\-])(\\d{4})[\\s/\\-.,]+(${mPattern}|\\d{1,2})[\\s/\\-.,]+(\\d{1,2})(?=[\\s)\\].,!?|\\-;:]|$)`,
    'i'
  );
  const matchYearFirst = normalized.match(dateRegexYearFirst);
  if (matchYearFirst) {
    const year = parseInt(matchYearFirst[1], 10);
    const rawMonth = matchYearFirst[2].toLowerCase();
    const month = isNaN(Number(rawMonth)) ? MONTH_MAP[rawMonth] : parseInt(rawMonth, 10) - 1;
    const day = parseInt(matchYearFirst[3], 10);
    if (month !== undefined && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return { date: new Date(year, month, day, targetHour, targetMinute, 0), isExplicit: true };
    }
  }

  // Pattern B: Day-First e.g. "18-Oct-2026", "18 Oct 2026", "18/October/2026"
  const dateRegexDayFirst = new RegExp(
    `(?:^|[\\s(\\[,;:|\\-])(\\d{1,2})(?:st|nd|rd|th|\\s*tarikh|\\s*तारीख)?[\\s/\\-.,]+(${mPattern})(?:[\\s/\\-.,]+(\\d{2,4}))?(?=[\\s)\\].,!?|\\-;:]|$)`,
    'i'
  );
  const matchDayFirst = normalized.match(dateRegexDayFirst);
  if (matchDayFirst) {
    const day = parseInt(matchDayFirst[1], 10);
    const month = MONTH_MAP[matchDayFirst[2].toLowerCase()];
    let year = matchDayFirst[3] ? parseInt(matchDayFirst[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    if (!matchDayFirst[3]) {
      const cand = new Date(year, month, day, targetHour, targetMinute, 0);
      if (cand.getTime() < now.getTime()) year += 1;
    }
    return { date: new Date(year, month, day, targetHour, targetMinute, 0), isExplicit: true };
  }

  // Pattern C: Month-First e.g. "Oct 18, 2026", "October 18 2026"
  const dateRegexMonthFirst = new RegExp(
    `(?:^|[\\s(\\[,;:|\\-])(${mPattern})[\\s/\\-.,]+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s/\\-.,]+(\\d{2,4}))?(?=[\\s)\\].,!?|\\-;:]|$)`,
    'i'
  );
  const matchMonthFirst = normalized.match(dateRegexMonthFirst);
  if (matchMonthFirst) {
    const month = MONTH_MAP[matchMonthFirst[1].toLowerCase()];
    const day = parseInt(matchMonthFirst[2], 10);
    let year = matchMonthFirst[3] ? parseInt(matchMonthFirst[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    if (!matchMonthFirst[3]) {
      const cand = new Date(year, month, day, targetHour, targetMinute, 0);
      if (cand.getTime() < now.getTime()) year += 1;
    }
    return { date: new Date(year, month, day, targetHour, targetMinute, 0), isExplicit: true };
  }

  // Pattern D: Numeric Day-Month-Year e.g. "18/10/2026", "18-10-2026", "18.10.2026"
  const dateRegexNumeric = /(?:^|[\s(\[,;:|\-])(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?(?=[\s)\].,!?|\-;:]|$)/;
  const matchNumeric = normalized.match(dateRegexNumeric);
  if (matchNumeric && parseInt(matchNumeric[1], 10) <= 31 && parseInt(matchNumeric[2], 10) <= 12) {
    const day = parseInt(matchNumeric[1], 10);
    const month = parseInt(matchNumeric[2], 10) - 1;
    let year = matchNumeric[3] ? parseInt(matchNumeric[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    return { date: new Date(year, month, day, targetHour, targetMinute, 0), isExplicit: true };
  }

  return null;
}

export function parseTimeFromSnippet(snippet: string): { hour: number; minute: number } | null {
  if (!snippet) return null;
  const explicitTimeRegex = /(?:^|\s|[^\d])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|बजे)?(?:\s*to|\s*-|$|\P{L})/ui;
  const m = snippet.match(explicitTimeRegex);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const mod = m[3]?.toLowerCase();
    if (mod === 'pm' && h < 12) h += 12;
    if (mod === 'am' && h === 12) h = 0;
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return { hour: h, minute: min };
    }
  }
  return null;
}

export function extractTemporalAndActionItems(
  text: string,
  options?: { referenceDate?: Date | string }
): TemporalExtractionResult {
  const normalized = text.toLowerCase().trim();
  const now = options?.referenceDate ? new Date(options.referenceDate) : new Date();

  // 1. Explicit Reminder Intent Detection (Unicode-safe boundaries)
  const reminderIntentRegex = /(?:^|\P{L})(?:remind|alarm|notification|याद\s*दिलाओ|याद\s*दिलाना|अलार्म\s*लगाओ|रिमाइंडर\s*लगाओ|रिमाइंडर\s*सेट\s*करो|सेट\s*करो)(?:$|\P{L})/ui;
  const hasReminderIntent = reminderIntentRegex.test(normalized);

  // 2. Part-of-Day Detection (Unicode-safe boundaries)
  const isMorning = /(?:^|\P{L})(?:subah|morning|सवेरे|सुबह|early morning)(?:$|\P{L})/ui.test(normalized);
  const isAfternoon = /(?:^|\P{L})(?:dopahar|afternoon|दोपहर|noon)(?:$|\P{L})/ui.test(normalized);
  const isEveningNight = /(?:^|\P{L})(?:shaam|sham|evening|raat|night|शाम|रात)(?:$|\P{L})/ui.test(normalized);

  // 3. Time Resolution (Priority: Explicit Event Time / Exam Time / Reporting Time)
  let targetHour = 10;
  let targetMinute = 0;
  let hasExplicitTime = false;

  const eventTimeKeywordRegex = /(?:exam(?:ination)?\s*(?:time|timing)|time\s*of\s*(?:examination|exam)|reporting\s*time|shift\s*time|gate\s*clos(?:e|ure)\s*time|परीक्षा\s*(?:का\s*)?समय|meeting\s*time|appointment\s*time)[\s:=-]+([^\n\r]+)/i;
  const eventTimeMatch = text.match(eventTimeKeywordRegex);
  if (eventTimeMatch) {
    const parsedTime = parseTimeFromSnippet(eventTimeMatch[1]);
    if (parsedTime) {
      targetHour = parsedTime.hour;
      targetMinute = parsedTime.minute;
      hasExplicitTime = true;
    }
  }

  // Pattern 3A: Hindi "bajkar" / "bajke" / "बजकर" / "बजके"
  if (!hasExplicitTime) {
    const bajkarRegex = /(?:^|\s|[^\d])(\d{1,2})\s*(?:bajkar|bajjkar|bajke|बजकर|बजके)\s*(\d{1,2})\s*(?:minutes?|minuetes?|minits?|m|मिनट)?(?:$|\P{L})/ui;
    const bMatch = text.match(bajkarRegex);
    if (bMatch) {
      let h = parseInt(bMatch[1], 10);
      const m = parseInt(bMatch[2], 10);
      if (h <= 12) {
        if (isEveningNight && h < 12) h += 12;
        else if (isAfternoon && h < 6) h += 12;
        else if (!isMorning && (h + 12) >= now.getHours() && now.getHours() >= 12 && h < 12) h += 12;
        else if (!isMorning && (h + 12) <= 23 && (h < now.getHours())) h += 12;
      }
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        targetHour = h;
        targetMinute = m;
        hasExplicitTime = true;
      }
    }
  }

  // Pattern 3B: Explicit numeric time with am/pm/baje/बजे (e.g. "8:00 baje", "8.00 बजे", "3.15 PM", "5 baje")
  if (!hasExplicitTime) {
    const explicitTimeRegex = /(?:^|\s|[^\d])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|बजे)(?:$|\P{L})/gui;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = explicitTimeRegex.exec(text)) !== null) {
      let h = parseInt(tMatch[1], 10);
      const m = tMatch[2] ? parseInt(tMatch[2], 10) : 0;
      const modifier = tMatch[3]?.toLowerCase();

      if (modifier === 'pm' && h < 12) h += 12;
      if (modifier === 'am' && h === 12) h = 0;

      if (modifier === 'baje' || modifier === 'बजे') {
        if (isEveningNight && h < 12) h += 12;
        else if (isAfternoon && h < 6) h += 12;
        else if (!isMorning && (h + 12) >= now.getHours() && now.getHours() >= 12 && h < 12) h += 12;
        else if (!isMorning && (h + 12) <= 23 && (h < now.getHours())) h += 12;
      }

      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        targetHour = h;
        targetMinute = m;
        hasExplicitTime = true;
        break;
      }
    }
  }

  // Pattern 3C: Explicit colon or dot time with am/pm (e.g. "9:00", "10:00", "14:30")
  if (!hasExplicitTime) {
    const colonTimeRegex = /(?:^|\s|[^\d])(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?(?:$|\P{L})/ui;
    const cMatch = text.match(colonTimeRegex);
    if (cMatch) {
      let h = parseInt(cMatch[1], 10);
      const m = parseInt(cMatch[2], 10);
      const mod = cMatch[3]?.toLowerCase();
      if (mod === 'pm' && h < 12) h += 12;
      if (mod === 'am' && h === 12) h = 0;
      if (!mod && h <= 12) {
        if (isEveningNight && h < 12) h += 12;
        else if (isAfternoon && h < 6) h += 12;
        else if (!isMorning && (h + 12) >= now.getHours() && now.getHours() >= 12 && h < 12) h += 12;
        else if (!isMorning && (h + 12) <= 23 && (h < now.getHours())) h += 12;
      }
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        targetHour = h;
        targetMinute = m;
        hasExplicitTime = true;
      }
    }
  }

  // Pattern 3D: Named time of day (e.g. "morning mein" -> 09:00)
  if (!hasExplicitTime) {
    if (/\b(?:early morning|subah subah|सवेरे सवेरे)\b/i.test(normalized)) {
      targetHour = 7;
      targetMinute = 0;
      hasExplicitTime = true;
    } else if (isMorning) {
      targetHour = 9;
      targetMinute = 0;
      hasExplicitTime = true;
    } else if (isAfternoon) {
      targetHour = 13;
      targetMinute = 0;
      hasExplicitTime = true;
    } else if (/(?:^|\P{L})(?:shaam|sham|evening|शाम)(?:$|\P{L})/ui.test(normalized)) {
      targetHour = 18;
      targetMinute = 0;
      hasExplicitTime = true;
    } else if (/\b(?:der raat|late night)\b/i.test(normalized)) {
      targetHour = 22;
      targetMinute = 0;
      hasExplicitTime = true;
    } else if (/(?:^|\P{L})(?:raat|night|रात)(?:$|\P{L})/ui.test(normalized)) {
      targetHour = 20;
      targetMinute = 0;
      hasExplicitTime = true;
    }
  }

  // 4. Universal Action & Event Extraction
  const actionItems: string[] = extractSemanticActionItems(text);

  // 5. Date Resolution (Priority Hierarchy: Contextual Exam Date > Event Date > Future Date > General Date)
  let resolvedDate: Date | null = null;
  let isExplicitDateFound = false;

  // PRIORITY 1: Explicit Exam / Examination / Test / Interview Date
  const examDateKeywordRegex = /(?:date\s*of\s*(?:examination|exam|test|interview)|exam(?:ination)?\s*date|test\s*date|interview\s*date|admit\s*card\s*date|hall\s*ticket\s*date|परीक्षा\s*(?:की\s*)?(?:तिथि|दिनांक)|exam\s*on|exam\s*held\s*on|paper\s*date)[\s:=-]+([^\n\r]+)/i;
  const examDateMatch = text.match(examDateKeywordRegex);
  if (examDateMatch) {
    const parsed = parseDateFromSnippet(examDateMatch[1], now, targetHour, targetMinute);
    if (parsed) {
      resolvedDate = parsed.date;
      isExplicitDateFound = parsed.isExplicit;
    }
  }

  // PRIORITY 2: Explicit Due Date / Event Date / Meeting Date / Travel Date
  if (!isExplicitDateFound) {
    const eventDateKeywordRegex = /(?:due\s*date|last\s*date(?:\s*of\s*submission)?|appointment\s*date|meeting\s*date|event\s*date|travel\s*date|departure\s*date|valid\s*till|expiry\s*date)[\s:=-]+([^\n\r]+)/i;
    const eventDateMatch = text.match(eventDateKeywordRegex);
    if (eventDateMatch) {
      const parsed = parseDateFromSnippet(eventDateMatch[1], now, targetHour, targetMinute);
      if (parsed) {
        resolvedDate = parsed.date;
        isExplicitDateFound = parsed.isExplicit;
      }
    }
  }

  // PRIORITY 3: Universal Candidate Date Scoring (Applies to ANY document: medical, travel, bills, notices, exams)
  if (!isExplicitDateFound) {
    const candidates: Array<{ date: Date; score: number }> = [];
    const lines = text.split('\n');

    lines.forEach(line => {
      const parsed = parseDateFromSnippet(line, now, targetHour, targetMinute);
      if (parsed) {
        let score = 0;
        const normLine = line.toLowerCase();
        const diffDays = (parsed.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

        // 1. Future event boost (schedules are for upcoming events)
        if (diffDays >= 0.5) {
          score += 200;
        } else if (diffDays < -1) {
          score -= 50;
        }

        // 2. Metadata penalty (suppress timestamps, DOB, creation and download dates)
        if (/(?:created|printed|generated|download|timestamp|system|dob\b|birth|issue)/i.test(normLine)) {
          score -= 500;
        }

        // 3. Event / Action context boost
        if (/(?:exam|test|due|appointment|meeting|review|travel|departure|valid|session|start|deadline|follow|interview|hearing|board|session|flight|show|entry|gate|closing|schedule|plan|दिनांक|तारीख|समय|परीक्षा)/i.test(normLine)) {
          score += 300;
        }

        candidates.push({ date: parsed.date, score });
      }
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      resolvedDate = candidates[0].date;
      isExplicitDateFound = true;
    }
  }

  // PRIORITY 4: Spoken & Natural Relative Temporal Extraction (Hindi, Hinglish & English)
  if (!isExplicitDateFound) {
    // 4A. Tarso / Narso / Charso / 3-4 days later
    if (
      /(?:^|\P{L})(?:charso|charson|चारसों)(?:$|\P{L})/ui.test(normalized) ||
      /\b(?:4|chaar|char|चार)\s*(?:din|days?|दिन|दिनों)\s*(?:baad|later|बाद|ke baad)\b/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, targetHour, targetMinute, 0);
    } else if (
      /(?:^|\P{L})(?:tarson|tarso|तरसों|narson|narso|नरसों|three days later|3 days later)(?:$|\P{L})/ui.test(normalized) ||
      /\b(?:3|teen|तीन)\s*(?:din|days?|दिन|दिनों)\s*(?:baad|later|बाद|ke baad)\b/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, targetHour, targetMinute, 0);
    }
    // 4B. Parso / Parson / Day after tomorrow / 2 days later
    else if (
      /(?:^|\P{L})(?:day after tomorrow|parson|parso|parsho|परसों)(?:$|\P{L})/ui.test(normalized) ||
      /\b(?:2|do|दो)\s*(?:din|days?|दिन|दिनों)\s*(?:baad|later|बाद|ke baad)\b/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      const isPastParso = /(?:^|\P{L})(?:tha|thi|the|gaya|gayi|diya|liya|था|थी|गया|beeta hua)(?:$|\P{L})/ui.test(normalized);
      const hasFutureIntent = /(?:^|\P{L})(?:jana hai|karna hai|jaunga|jayenge|milega|milna hai|hogi|hoga|karenge|rahega|aayega|bhejna hai|जाना है|करना है)(?:$|\P{L})/ui.test(normalized);
      if (isPastParso && !hasFutureIntent && !normalized.includes('after tomorrow')) {
        resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, targetHour, targetMinute, 0);
      } else {
        resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, targetHour, targetMinute, 0);
      }
    }
    // 4C. Tomorrow / Kal / कल
    else if (
      /(?:^|\P{L})(?:tomorrow|कल|kal|cal|kall|agle din|अगले दिन|next day|aane wale kal|आने वाले कल)(?:$|\P{L})/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      const isPastKal = /(?:^|\P{L})(?:tha|thi|the|gaya|gayi|diya|liya|bola tha|था|थी|गया|beeta hua|beeta kal|gaye the)(?:$|\P{L})/ui.test(normalized);
      const hasFutureIntent = /(?:^|\P{L})(?:jana hai|karna hai|jaunga|jayenge|milega|milna hai|hogi|hoga|karenge|rahega|aayega|bhejna hai|lena hai|dekhna hai|जाना है|करना है|जाएंगे|जाऊंगा|होगा|मिलेगा|होगी|भेजना है|मिलना है)(?:$|\P{L})/ui.test(normalized);
      if (isPastKal && !hasFutureIntent && !normalized.includes('tomorrow')) {
        resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, targetHour, targetMinute, 0);
      } else {
        resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, targetHour, targetMinute, 0);
      }
    }
    // 4D. Today / Aaj / आज / Abhi
    else if (
      /(?:^|\P{L})(?:today|aaj|आज|abhi|अभी|tonight|aaj raat|आज रात|aaj shaam|आज शाम|aaj subah|आज सुबह|aaj dopahar|आज दोपहर)(?:$|\P{L})/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute, 0);
    }
    // 4E. Yesterday / Beeta kal / बीता कल
    else if (
      /(?:^|\P{L})(?:yesterday|beeta kal|beete kal|बीता कल|बीते कल|beeta hua kal)(?:$|\P{L})/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, targetHour, targetMinute, 0);
    }
    // 4F. Next week / agle hafte / अगले हफ्ते
    else if (
      /(?:^|\P{L})(?:next week|agle hafte|agla hafta|अगले हफ्ते|अगला हफ्ता|agle saptah|अगले सप्ताह|agla saptah|अगला सप्ताह|next saptah|ek hafte baad|1 hafte baad|एक हफ्ते बाद)(?:$|\P{L})/ui.test(normalized)
    ) {
      isExplicitDateFound = true;
      resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, targetHour, targetMinute, 0);
    }
    // 4G. "in X days" / "X din baad"
    else if (/\b(\d+)\s*(?:days?|din|dino|दिन|दिनों)\s*(?:later|baad|बाद|ke baad|के बाद|me|mein|में)\b/ui.test(normalized)) {
      const daysMatch = normalized.match(/\b(\d+)\s*(?:days?|din|dino|दिन|दिनों)\s*(?:later|baad|बाद|ke baad|के बाद|me|mein|में)\b/ui);
      if (daysMatch) {
        const daysToAdd = parseInt(daysMatch[1], 10);
        isExplicitDateFound = true;
        resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd, targetHour, targetMinute, 0);
      }
    }
    // 4H. Days of week (Hindi, English, Hinglish)
    else {
      for (const [dayName, dayIndex] of Object.entries(DAYS_OF_WEEK)) {
        const dayRegex = new RegExp(`(?:^|\\P{L})(?:next|agle|अगले|aane wale|आने वाले)?\\s*${dayName}(?:\\s*(?:ko|ke din|को))?(?:$|\\P{L})`, 'ui');
        if (dayRegex.test(normalized)) {
          isExplicitDateFound = true;
          const currentDay = now.getDay();
          let daysUntil = (dayIndex - currentDay + 7) % 7;
          if (daysUntil === 0) {
            const candidateToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute, 0);
            if (candidateToday.getTime() <= now.getTime() || /(?:next|agle|अगले)/ui.test(normalized)) {
              daysUntil = 7;
            }
          }
          resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil, targetHour, targetMinute, 0);
          break;
        }
      }
    }
  }

  // If time was specified without a date, default to today (or tomorrow if past)
  if (!isExplicitDateFound && hasExplicitTime) {
    const candidateToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMinute, 0);
    if (candidateToday.getTime() > now.getTime()) {
      resolvedDate = candidateToday;
      isExplicitDateFound = true;
    } else {
      resolvedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, targetHour, targetMinute, 0);
      isExplicitDateFound = true;
    }
  }

  // 6. Classify into Temporal Buckets
  let temporalClass: 'today' | 'future' | 'historical' = 'historical';

  if (resolvedDate) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const resolvedTime = resolvedDate.getTime();

    if (resolvedTime >= startOfToday && resolvedTime <= endOfToday) {
      temporalClass = 'today';
    } else if (resolvedTime > endOfToday) {
      temporalClass = 'future';
    } else {
      temporalClass = 'historical';
    }
  } else {
    if (actionItems.length > 0) {
      temporalClass = 'today';
    } else {
      temporalClass = 'historical';
    }
  }

  // 6. High Confidence Reminder
  // True if:
  // - User explicitly requested a reminder / notification and resolvedDate is future or later today
  // - OR temporalClass is 'future' and has resolvedDate and (action items or explicit time)
  // - OR temporalClass is 'today' and has future time today and (action items or reminder intent)
  const isFutureTime = resolvedDate ? resolvedDate.getTime() > now.getTime() : false;
  const isHighConfidenceReminder = Boolean(
    (isFutureTime && hasReminderIntent) ||
    (temporalClass === 'future' && resolvedDate && (actionItems.length > 0 || hasExplicitTime)) ||
    (temporalClass === 'today' && isFutureTime && hasExplicitTime && (actionItems.length > 0 || hasReminderIntent))
  );

  return {
    temporalClass,
    resolvedDatetime: resolvedDate ? resolvedDate.toISOString() : null,
    actionItems,
    isHighConfidenceReminder,
  };
}

// Unicode-safe clause connector patterns (English & Hindi)
const MULTI_INTENT_CONNECTORS = [
  'and also', 'and then', 'and',
  'और भी', 'और फिर', 'और',
  'aur bhi', 'aur phir', 'aur',
  'तथा', 'tatha',
  'एवं', 'evam',
  'साथ ही साथ', 'साथ ही', 'साथ में', 'saath hi',
  'फिर', 'phir',
  'उसके बाद', 'uske baad',
  'इसके अलावा', 'iske alawa',
  'also', 'then'
];

const escapedConnectors = MULTI_INTENT_CONNECTORS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
export interface SplitIntentEvent {
  clauseText: string;
  item: ChecklistItem;
  temporalResult: TemporalExtractionResult;
}

/**
 * Intelligent Multi-Intent Speech & Text Splitter
 * Universal, semantic handler for:
 * 1. Structured documents, lists, memos, circulars, WhatsApp forwards (uses extractSemanticActionItems)
 * 2. Spoken multi-event utterances (e.g. "Kal subah 9 baje Sharmaji se milna hai aur shaam 5 baje bill pay karna hai")
 * 3. Continuous prose with conjunctions (does NOT break sentences or noun pairs)
 */
export function splitMultiIntentTranscript(
  text: string,
  options?: { referenceDate?: string | Date }
): SplitIntentEvent[] {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (!clean) return [];

  // 1. Structured Document / List check (numbered items, bullet points, or multi-line agendas)
  const listItemStartRegex = /^(?:(?:\(?\d{1,2}[.)\]:\-]|(?:\([a-zA-Z0-9]\))|[a-zA-Z][.)\-]|(?:\(?[ivxIVX]+[.)\-]\)?)|[०-९]{1,2}[.)\]:\-])\s*|[•\-*⁃‣►✔✓\u2022\u2023\u25E6\u2043\u2219]\s+)/um;
  const semanticItems = extractSemanticActionItems(clean);
  const isStructuredList = listItemStartRegex.test(clean) || (clean.includes('\n') && semanticItems.length >= 1);

  if (isStructuredList && semanticItems.length > 0) {
    const overallTemporal = extractTemporalAndActionItems(clean, options);
    return semanticItems.map((actText, idx) => {
      const itemTemporal = extractTemporalAndActionItems(actText, {
        referenceDate: overallTemporal.resolvedDatetime || options?.referenceDate,
      });
      return {
        clauseText: actText,
        item: {
          id: String(idx + 1),
          text: actText,
          completed: false,
          dueDatetime: itemTemporal.resolvedDatetime || overallTemporal.resolvedDatetime,
        },
        temporalResult: itemTemporal.resolvedDatetime ? itemTemporal : overallTemporal,
      };
    });
  }

  // 2. Spoken / Conversational Multi-Intent (Only split on connectors if clauses have distinct time or action intents)
  const escapedConnectors = MULTI_INTENT_CONNECTORS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const connectorRegex = new RegExp(`(?:\\s*(?:[;]+|(?:^|\\s)(?:${escapedConnectors})(?:\\s|$))\\s*)`, 'ui');

  const candidateClauses = clean
    .split(connectorRegex)
    .map(c => c.trim())
    .filter(c => c.length > 3);

  const timeRegex = /(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|baje|बजे)|\b(?:kal|tomorrow|aaj|today|parso|somwar|mangalwar|budhwar|guruwar|shukrawar|shaniwar|ravivar|morning|evening|shaam|subah|dopahar|raat)\b)/ui;
  const clausesWithTimeOrAction = candidateClauses.filter(c => 
    timeRegex.test(c) || /(?:karna|milna|jana|dena|lena|bhejna|pay|call|send|meet|buy|submit|dekhna|aana)\b/ui.test(c)
  );

  if (candidateClauses.length > 1 && clausesWithTimeOrAction.length >= 2) {
    const events: SplitIntentEvent[] = [];
    let inheritedReferenceDate: string | Date | undefined = options?.referenceDate;

    for (let i = 0; i < candidateClauses.length; i++) {
      const clause = candidateClauses[i];
      const temporalResult = extractTemporalAndActionItems(clause, {
        referenceDate: inheritedReferenceDate,
      });

      if (temporalResult.resolvedDatetime) {
        inheritedReferenceDate = temporalResult.resolvedDatetime;
      }

      const taskText = temporalResult.actionItems[0] || clause;

      events.push({
        clauseText: clause,
        item: {
          id: String(i + 1),
          text: taskText,
          completed: false,
          dueDatetime: temporalResult.resolvedDatetime,
        },
        temporalResult,
      });
    }
    return events;
  }

  // 3. Single Event fallback
  const singleResult = extractTemporalAndActionItems(clean, options);
  const mainAction = singleResult.actionItems[0] || clean;
  return [{
    clauseText: clean,
    item: {
      id: '1',
      text: mainAction,
      completed: false,
      dueDatetime: singleResult.resolvedDatetime,
    },
    temporalResult: singleResult,
  }];
}

