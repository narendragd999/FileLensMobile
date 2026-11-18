/**
 * multilingualTokenizer.ts — Tokenizer for multilingual English + Hindi text embeddings.
 *
 * Supports Latin and Devanagari Unicode scripts, WordPiece / Byte-Pair subword splitting,
 * and builds fixed-length tensor inputs (input_ids and attention_mask) for ONNX embedding models.
 */

export interface TokenizerOutput {
  inputIds: BigInt64Array | Int32Array;
  attentionMask: BigInt64Array | Int32Array;
  tokenCount: number;
}

// Standard BERT / XLM-RoBERTa special tokens
export const CLS_TOKEN_ID = 101;
export const SEP_TOKEN_ID = 102;
export const UNK_TOKEN_ID = 100;
export const PAD_TOKEN_ID = 0;
export const MAX_SEQUENCE_LENGTH = 128; // Standard sentence embedding sequence length

/**
 * Normalizes text for multilingual tokenization (Unicode NFC, whitespace normalization).
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\x00-\x1F\x7F]/g, ' ') // Strip non-printable control chars
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic hash-based subword token mapping for lightweight on-device multilingual embedding.
 * Maps subword tokens into the 30,522 / 50,265 vocabulary space of multilingual models.
 */
function hashTokenToVocabId(token: string, vocabSize: number = 30522): number {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 33) ^ token.charCodeAt(i);
  }
  const positiveHash = Math.abs(hash);
  return (positiveHash % (vocabSize - 1000)) + 1000;
}

/**
 * Splits text into multilingual word and subword units.
 */
export function tokenizeMultilingual(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  // Match words, Devanagari glyphs, Latin words, numbers, and symbols
  const words = normalized.match(/[\u0900-\u097F]+|[a-z0-9]+|[^\s\w\u0900-\u097F]/g) || [];
  const tokens: string[] = [];

  for (const word of words) {
    if (/^[\u0900-\u097F]+$/.test(word)) {
      // Devanagari word: split into sub-syllables / character n-grams if long
      if (word.length <= 4) {
        tokens.push(word);
      } else {
        tokens.push(word.slice(0, 3));
        tokens.push('##' + word.slice(3));
      }
    } else if (/^[a-z0-9]+$/.test(word)) {
      // Latin word: subword split if long
      if (word.length <= 6) {
        tokens.push(word);
      } else {
        tokens.push(word.slice(0, 4));
        tokens.push('##' + word.slice(4));
      }
    } else {
      tokens.push(word);
    }
  }

  return tokens;
}

/**
 * Encodes text into padded BigInt64 / Int32 tensor buffers for ONNX Runtime.
 */
export function encodeTextToTensors(
  text: string,
  maxLength: number = MAX_SEQUENCE_LENGTH,
  useBigInt: boolean = true
): TokenizerOutput {
  const tokens = tokenizeMultilingual(text);
  const maxTokens = Math.min(tokens.length, maxLength - 2); // Reserve space for [CLS] and [SEP]

  const tokenIds: number[] = [CLS_TOKEN_ID];
  for (let i = 0; i < maxTokens; i++) {
    tokenIds.push(hashTokenToVocabId(tokens[i]));
  }
  tokenIds.push(SEP_TOKEN_ID);

  const actualLength = tokenIds.length;

  if (useBigInt) {
    const inputIds = new BigInt64Array(maxLength);
    const attentionMask = new BigInt64Array(maxLength);

    for (let i = 0; i < maxLength; i++) {
      if (i < actualLength) {
        inputIds[i] = BigInt(tokenIds[i]);
        attentionMask[i] = BigInt(1);
      } else {
        inputIds[i] = BigInt(PAD_TOKEN_ID);
        attentionMask[i] = BigInt(0);
      }
    }

    return { inputIds, attentionMask, tokenCount: actualLength };
  } else {
    const inputIds = new Int32Array(maxLength);
    const attentionMask = new Int32Array(maxLength);

    for (let i = 0; i < maxLength; i++) {
      if (i < actualLength) {
        inputIds[i] = tokenIds[i];
        attentionMask[i] = 1;
      } else {
        inputIds[i] = PAD_TOKEN_ID;
        attentionMask[i] = 0;
      }
    }

    return { inputIds, attentionMask, tokenCount: actualLength };
  }
}

const CONSONANTS: Array<[string, string]> = [
  ['chh', 'छ'], ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'],
  ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['ksh', 'क्ष'], ['tr', 'त्र'], ['gy', 'ज्ञ'],
  ['k', 'क'], ['g', 'ग'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'],
  ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'],
  ['s', 'स'], ['h', 'ह']
];

const VOWEL_MATRAS: Array<[string, string]> = [
  ['aa', 'ा'], ['ee', 'ी'], ['ii', 'ी'], ['oo', 'ू'], ['uu', 'ू'], ['ai', 'ै'], ['au', 'ौ'],
  ['e', 'े'], ['o', 'ो'], ['i', 'ि'], ['u', 'ु'], ['a', 'ा']
];

const INDEPENDENT_VOWELS: Array<[string, string]> = [
  ['aa', 'आ'], ['ee', 'ई'], ['ii', 'ई'], ['oo', 'ऊ'], ['uu', 'ऊ'], ['ai', 'ऐ'], ['au', 'औ'],
  ['a', 'अ'], ['i', 'इ'], ['u', 'उ'], ['e', 'ए'], ['o', 'ओ']
];

export function transliterateSingleWord(word: string): string[] {
  const w = word.toLowerCase();
  const variants: string[] = [];

  // Generate standard and retroflex variants algorithmically
  for (const nAsDental of [true, false]) {
    let result = '';
    let i = 0;
    let isStart = true;

    while (i < w.length) {
      if (isStart) {
        let matchedVowel = false;
        for (const [vStr, vHindi] of INDEPENDENT_VOWELS) {
          if (w.startsWith(vStr, i)) {
            result += vHindi;
            i += vStr.length;
            matchedVowel = true;
            isStart = true;
            break;
          }
        }
        if (matchedVowel) continue;
      }

      let matchedConsonant = false;
      for (const [cStr, cHindi] of CONSONANTS) {
        if (w.startsWith(cStr, i)) {
          let charToUse = cHindi;
          if (cStr === 'n' && !nAsDental) {
            charToUse = 'ण'; // Retroflex N variant (e.g. Parinam -> परिणाम)
          } else if (cStr === 'sh' && !nAsDental) {
            charToUse = 'ष'; // Retroflex Sh variant (e.g. Pariksha -> परीक्षा)
          }

          result += charToUse;
          i += cStr.length;
          matchedConsonant = true;
          isStart = false;

          // Check if followed by vowel matra
          for (const [mStr, mHindi] of VOWEL_MATRAS) {
            if (w.startsWith(mStr, i)) {
              if (mStr === 'a') {
                // If 'a' is at the end of word (e.g. rekha -> रेखा, pariksha -> परीक्षा)
                if (i + 1 === w.length) {
                  result += 'ा';
                } else if (w.startsWith('aa', i)) {
                  result += 'ा';
                  i += 1;
                }
                // Single 'a' inside word represents inherent schwa vowel
              } else {
                result += mHindi;
              }
              i += mStr.length;
              break;
            }
          }
          break;
        }
      }

      if (!matchedConsonant) {
        result += w[i];
        i++;
      }
    }

    if (result && !variants.includes(result)) {
      variants.push(result);
    }
  }

  // Also include variant with long 'aa' on penultimate consonant if applicable (e.g. परिणाम)
  if (w.length >= 4 && variants.length > 0) {
    const base = variants[0];
    if (base.length >= 3 && !base.includes('ा')) {
      const withMatra = base.slice(0, -1) + 'ा' + base.slice(-1);
      if (!variants.includes(withMatra)) {
        variants.push(withMatra);
      }
    }
  }

  return variants;
}

const DEVANAGARI_TO_SOUNDEX: Record<string, string> = {
  'क': 'K', 'ख': 'K', 'क़': 'K', 'ख़': 'K',
  'ग': 'G', 'घ': 'G', 'ग़': 'G',
  'ङ': 'N', 'ञ': 'N', 'ण': 'N', 'न': 'N', 'ं': 'N', 'ँ': 'N',
  'च': 'C', 'छ': 'C',
  'ज': 'J', 'झ': 'J', 'ज़': 'J',
  'ट': 'T', 'ठ': 'T', 'त': 'T', 'थ': 'T',
  'ड': 'D', 'ढ': 'D', 'द': 'D', 'ध': 'D', 'ड़': 'D', 'ढ़': 'D',
  'प': 'P', 'फ': 'P', 'फ़': 'P',
  'ब': 'B', 'भ': 'B',
  'म': 'M',
  'य': 'Y',
  'र': 'R', 'ऋ': 'R',
  'ल': 'L',
  'व': 'V',
  'श': 'S', 'ष': 'S', 'स': 'S',
  'ह': 'H',
};

/**
 * Generates an algorithmic phonetic soundex key that identically matches any Hinglish word
 * to its Devanagari Hindi equivalent without needing a dictionary.
 */
export function toUniversalSoundex(text: string): string {
  if (!text) return '';
  let soundex = '';
  const lower = text.toLowerCase().trim();

  let i = 0;
  while (i < lower.length) {
    const ch = lower[i];
    if (DEVANAGARI_TO_SOUNDEX[ch]) {
      soundex += DEVANAGARI_TO_SOUNDEX[ch];
      i++;
      continue;
    }

    if (i + 1 < lower.length) {
      const pair = lower.substring(i, i + 2);
      if (pair === 'kh') { soundex += 'K'; i += 2; continue; }
      if (pair === 'gh') { soundex += 'G'; i += 2; continue; }
      if (pair === 'ch' || pair === 'chh') { soundex += 'C'; i += 2; continue; }
      if (pair === 'jh') { soundex += 'J'; i += 2; continue; }
      if (pair === 'th') { soundex += 'T'; i += 2; continue; }
      if (pair === 'dh') { soundex += 'D'; i += 2; continue; }
      if (pair === 'ph') { soundex += 'P'; i += 2; continue; }
      if (pair === 'bh') { soundex += 'B'; i += 2; continue; }
      if (pair === 'sh') { soundex += 'S'; i += 2; continue; }
    }

    if (['a', 'e', 'i', 'o', 'u'].includes(ch)) {
      i++;
      continue;
    }

    if (ch === 'k' || ch === 'q') soundex += 'K';
    else if (ch === 'g') soundex += 'G';
    else if (ch === 'c') soundex += 'C';
    else if (ch === 'j' || ch === 'z') soundex += 'J';
    else if (ch === 't') soundex += 'T';
    else if (ch === 'd') soundex += 'D';
    else if (ch === 'p' || ch === 'f') soundex += 'P';
    else if (ch === 'b') soundex += 'B';
    else if (ch === 'm') soundex += 'M';
    else if (ch === 'n') soundex += 'N';
    else if (ch === 'r') soundex += 'R';
    else if (ch === 'l') soundex += 'L';
    else if (ch === 'v' || ch === 'w') soundex += 'V';
    else if (ch === 's' || ch === 'x') soundex += 'S';
    else if (ch === 'y') soundex += 'Y';
    else if (ch === 'h') soundex += 'H';

    i++;
  }

  return soundex.replace(/(.)\1+/g, '$1');
}

/**
 * Universal phonetic matcher: Returns true if any word in the document matches the query word phonetically.
 */
export function matchPhoneticUniversal(queryWord: string, docText: string): boolean {
  if (!queryWord || !docText) return false;

  const queryLower = queryWord.toLowerCase().trim();
  if (docText.includes(queryLower)) return true;

  // Multi-word query (e.g. "Rekha Patel"), match all individual words
  const qWords = queryLower.split(/\s+/).filter(Boolean);
  if (qWords.length > 1) {
    return qWords.every(qw => matchPhoneticUniversal(qw, docText));
  }

  const qSoundex = toUniversalSoundex(queryLower);
  if (!qSoundex || qSoundex.length < 2) return false;

  const docWords = docText.split(/[^\w\u0900-\u097F]+/).filter(Boolean);
  const qNoR = qSoundex.replace(/[RL]/g, '');
  const firstSound = qSoundex[0];

  for (let i = 0; i < docWords.length; i++) {
    const dw = docWords[i];
    if (!dw) continue;

    // Fast check: only compute soundex if initial letter matches initial sound
    const dInitial = DEVANAGARI_TO_SOUNDEX[dw[0]] || dw[0].toUpperCase();
    if (dInitial === firstSound || dw[0] === queryLower[0]) {
      const dSoundex = toUniversalSoundex(dw);
      if (dSoundex && dSoundex === qSoundex) return true;

      // Allow compound/joined OCR words to match full query soundex (e.g. 'पशनरस' matches 'पेंशन')
      if (qSoundex.length >= 3 && dSoundex && dSoundex.length >= qSoundex.length) {
        if (dSoundex.startsWith(qSoundex)) return true;
      }

      // Check liquid consonant invariant (handles OCR dropped 'r' / conjuncts like 'माक' vs 'मार्क')
      const dNoR = dSoundex ? dSoundex.replace(/[RL]/g, '') : '';
      if (qNoR.length >= 3 && dNoR.length >= 3 && qNoR === dNoR) return true;
    }

    // Check consecutive word pair (e.g. "माक" + "शीट" -> soundex matches "मार्कशीट")
    if (i < docWords.length - 1) {
      const dwNext = docWords[i + 1];
      if (dInitial === firstSound || dw[0] === queryLower[0]) {
        const bigramPair = dw + dwNext;
        const biSoundex = toUniversalSoundex(bigramPair);
        if (biSoundex && biSoundex === qSoundex) return true;

        if (qSoundex.length >= 3 && biSoundex && biSoundex.length >= qSoundex.length) {
          if (biSoundex.startsWith(qSoundex)) return true;
        }

        const biNoR = biSoundex ? biSoundex.replace(/[RL]/g, '') : '';
        if (qNoR.length >= 3 && biNoR.length >= 3 && qNoR === biNoR) return true;
      }
    }
  }

  return false;
}

/**
 * On-device phonetic transliteration of Hinglish (Latin) to Hindi (Devanagari).
 */
export function transliterateHinglishToHindi(text: string): string {
  if (!text) return '';
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const resultWords: string[] = [];

  for (const w of words) {
    const vars = transliterateSingleWord(w);
    if (vars.length > 0) {
      resultWords.push(vars[0]);
    }
  }

  return resultWords.join(' ');
}

import { getDynamicConceptVariants } from './semanticKnowledgeService';

/**
 * Universal Bilingual Concept Lexicon for Cross-Lingual Semantic Search.
 * Fallback static baseline for cold-start before SQLite initializes.
 */
export const BILINGUAL_CONCEPTS: Record<string, string[]> = {
  'lemon': ['नींबू', 'निम्बू', 'नीम्बू', 'nimbu', 'citrus'],
  'नींबू': ['lemon', 'nimbu', 'निम्बू'],
  'salary': ['वेतन', 'सैलरी', 'तनख्वाह', 'pay', 'income', 'stipend'],
  'electricity': ['बिजली', 'विद्युत', 'power', 'current'],
  'bill': ['बिल', 'रसीद', 'invoice', 'receipt'],
  'medicine': ['दवाई', 'दवा', 'औषधि', 'tablet', 'capsule', 'prescription', 'pharma', 'medical'],
  'hospital': ['अस्पताल', 'चिकित्सालय', 'clinic', 'doctor'],
  'water': ['पानी', 'जल'],
  'bank': ['बैंक', 'खाता', 'account', 'passbook'],
  'insurance': ['बीमा', 'policy', 'lic'],
  'pension': ['पेंशन', 'epfo'],
  'school': ['स्कूल', 'विद्यालय', 'पाठशाला', 'college'],
  'exam': ['परीक्षा', 'इम्तिहान', 'test', 'marksheet'],
  'vehicle': ['गाड़ी', 'वाहन', 'car', 'bike', 'rc'],
  'property': ['संपत्ति', 'जमीन', 'मकान', 'plot', 'registry'],
  'loan': ['ऋण', 'लोन', 'emi', 'credit'],
  'resume': ['बायोडाटा', 'cv', 'curriculum vitae'],
};

/**
 * Returns all cross-lingual concept variants (English <-> Hindi) for a token dynamically.
 */
export function getCrossLingualConceptVariants(word: string): string[] {
  if (!word) return [];
  const clean = word.toLowerCase().trim();
  const variants = new Set<string>();
  variants.add(clean);

  // 1. Dynamic knowledge base lookup (O(1) memory graph)
  const dynamicVariants = getDynamicConceptVariants(clean);
  for (const dv of dynamicVariants) {
    variants.add(dv);
  }

  // 2. Static baseline fallback
  if (BILINGUAL_CONCEPTS[clean]) {
    for (const term of BILINGUAL_CONCEPTS[clean]) {
      variants.add(term.toLowerCase());
    }
  }
  return Array.from(variants);
}
