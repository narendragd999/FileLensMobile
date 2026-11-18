/**
 * semanticKnowledgeService.ts — Dynamic Semantic Knowledge Base & Continuous Learning Service.
 *
 * Persists semantic concepts, cross-lingual equivalents, and category relationships in SQLite.
 * Provides in-memory O(1) graph caching for zero-latency NLP search and automatically
 * enriches concepts from OCR document signatures during indexing.
 */

import { getDatabase } from './database';

export interface SemanticConceptRecord {
  id?: number;
  concept_key: string;
  category: string;
  variants: string[];
  learned_from: 'system' | 'auto_inferred' | 'user_custom';
  usage_count: number;
  last_updated: string;
}

// Initial systematic base semantic seed
const DEFAULT_SEMANTIC_SEEDS: Array<{ key: string; category: string; variants: string[] }> = [
  // Identity & Government IDs
  {
    key: 'identity card',
    category: 'identity',
    variants: ['आधार', 'aadhaar', 'aadhar', 'pan card', 'voter id', 'मतदाता', 'pehchan', 'पहचान', 'id card', 'uidai', 'पहचान पत्र', 'identity card', 'driving license', 'passport', 'पासपोर्ट']
  },
  {
    key: 'identity',
    category: 'identity',
    variants: ['आधार', 'aadhaar', 'aadhar', 'pan card', 'voter id', 'मतदाता', 'pehchan', 'पहचान', 'id card', 'uidai', 'पहचान पत्र', 'identity card', 'driving license', 'passport', 'पासपोर्ट']
  },
  {
    key: 'id card',
    category: 'identity',
    variants: ['aadhaar', 'aadhar', 'pan card', 'voter id', 'pehchan', 'पहचान', 'identity', 'id card', 'uidai', 'driving license', 'पहचान पत्र']
  },
  {
    key: 'पहचान',
    category: 'identity',
    variants: ['identity', 'id card', 'identity card', 'aadhaar', 'aadhar', 'pan card', 'voter id', 'pehchan', 'पहचान पत्र']
  },
  {
    key: 'पहचान पत्र',
    category: 'identity',
    variants: ['identity', 'id card', 'identity card', 'aadhaar', 'aadhar', 'pan card', 'voter id', 'pehchan', 'पहचान पत्र']
  },
  {
    key: 'card',
    category: 'identity',
    variants: ['कार्ड', 'patr', 'पत्र']
  },
  // Utilities & Bills
  {
    key: 'electricity',
    category: 'utility',
    variants: ['बिजली', 'विद्युत', 'power', 'current', 'bill', 'discom']
  },
  {
    key: 'बिजली',
    category: 'utility',
    variants: ['electricity', 'power', 'bill', 'bijli', 'विद्युत']
  },
  {
    key: 'bill',
    category: 'utility',
    variants: ['बिल', 'रसीद', 'invoice', 'receipt', 'payment', 'due']
  },
  // Finance & Salary
  {
    key: 'salary',
    category: 'finance',
    variants: ['वेतन', 'सैलरी', 'तनख्वाह', 'pay', 'income', 'stipend', 'payslip']
  },
  {
    key: 'वेतन',
    category: 'finance',
    variants: ['salary', 'pay', 'income', 'सैलरी', 'तनख्वाह', 'payslip']
  },
  {
    key: 'bank',
    category: 'finance',
    variants: ['बैंक', 'खाता', 'account', 'passbook', 'statement', 'ifsc']
  },
  {
    key: 'insurance',
    category: 'finance',
    variants: ['बीमा', 'policy', 'lic', 'premium']
  },
  {
    key: 'loan',
    category: 'finance',
    variants: ['ऋण', 'लोन', 'emi', 'credit', 'interest']
  },
  // Education & Academics
  {
    key: 'marksheet',
    category: 'education',
    variants: ['मार्कशीट', 'अंकसूची', 'marks', 'sheet', 'result', 'scorecard', 'grade card', 'transcript']
  },
  {
    key: 'exam',
    category: 'education',
    variants: ['परीक्षा', 'इम्तिहान', 'test', 'marksheet', 'result', 'score']
  },
  {
    key: 'certificate',
    category: 'education',
    variants: ['प्रमाणपत्र', 'degree', 'diploma', 'sanad', 'सनद']
  },
  {
    key: 'admit',
    category: 'education',
    variants: ['एडमिट', 'प्रवेश', 'hall ticket', 'admit card', 'roll no', 'call letter']
  },
  // Medical & Health
  {
    key: 'medicine',
    category: 'medical',
    variants: ['दवाई', 'दवा', 'औषधि', 'tablet', 'capsule', 'prescription', 'pharma', 'medical', 'rx']
  },
  {
    key: 'hospital',
    category: 'medical',
    variants: ['अस्पताल', 'चिकित्सालय', 'clinic', 'doctor', 'opd', 'patient']
  }
];

// Document Signature Patterns for On-Device Continuous Learning
interface DocumentSignature {
  category: string;
  primaryKey: string;
  triggers: string[];
  associatedVariants: string[];
}

const DOCUMENT_SIGNATURES: DocumentSignature[] = [
  {
    category: 'identity',
    primaryKey: 'aadhaar',
    triggers: ['unique identification authority', 'mera aadhaar', 'मेरा आधार', 'uidai', 'enrollment no', 'vid :'],
    associatedVariants: ['aadhaar', 'aadhar', 'आधार', 'identity', 'id card', 'uidai', 'पहचान']
  },
  {
    category: 'identity',
    primaryKey: 'pan',
    triggers: ['income tax department', 'permanent account number', 'govt of india', 'पैन कार्ड'],
    associatedVariants: ['pan', 'pan card', 'पैन', 'identity', 'id card']
  },
  {
    category: 'identity',
    primaryKey: 'voter',
    triggers: ['election commission of India', 'elector photo identity', 'मतदाता पहचान', 'भारत निर्वाचन आयोग'],
    associatedVariants: ['voter', 'voter id', 'मतदाता', 'election card', 'epic', 'identity']
  },
  {
    category: 'identity',
    primaryKey: 'driving license',
    triggers: ['driving licence', 'driving license', 'transport department', 'motor vehicles', 'form 7'],
    associatedVariants: ['driving', 'license', 'dl', 'ड्राइविंग लाइसेंस', 'vehicle']
  },
  {
    category: 'education',
    primaryKey: 'marksheet',
    triggers: ['marks statement', 'board of high school', 'secondary school examination', 'statement of marks', 'grade sheet', 'अंकसूची'],
    associatedVariants: ['marksheet', 'marks', 'sheet', 'result', 'अंकसूची', 'मार्कशीट']
  },
  {
    category: 'education',
    primaryKey: 'admit card',
    triggers: ['admit card', 'hall ticket', 'roll no.', 'examination hall ticket', 'प्रवेश पत्र'],
    associatedVariants: ['admit', 'hall ticket', 'admit card', 'roll no', 'प्रवेश पत्र']
  },
  {
    category: 'finance',
    primaryKey: 'salary slip',
    triggers: ['pay slip', 'salary slip', 'earnings', 'deductions', 'basic pay', 'net salary', 'provident fund'],
    associatedVariants: ['salary', 'payslip', 'pay', 'income', 'वेतन', 'सैलरी']
  },
  {
    category: 'utility',
    primaryKey: 'electricity bill',
    triggers: ['electricity bill', 'power distribution', 'consumer no', 'meter reading', 'kwh', 'विद्युत वितरण'],
    associatedVariants: ['electricity', 'बिजली', 'bill', 'power', 'विद्युत']
  }
];

// High-speed In-Memory Semantic Graph
let inMemorySemanticGraph: Map<string, Set<string>> = new Map();
let isGraphLoaded = false;
let initPromise: Promise<void> | null = null;

/**
 * Initializes and loads the semantic graph into fast RAM cache from SQLite.
 */
export async function initializeSemanticKnowledge(): Promise<void> {
  if (isGraphLoaded) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const db = await getDatabase();

      // Ensure table exists
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS semantic_concepts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          concept_key TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          variants_json TEXT NOT NULL,
          learned_from TEXT DEFAULT 'system',
          usage_count INTEGER DEFAULT 0,
          last_updated TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_concept_key ON semantic_concepts(concept_key);
      `);

      // Seed initial base concepts if empty
      const countRes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM semantic_concepts');
      if (!countRes || countRes.count === 0) {
        const now = new Date().toISOString();
        await db.withTransactionAsync(async () => {
          for (const seed of DEFAULT_SEMANTIC_SEEDS) {
            await db.runAsync(
              `INSERT OR IGNORE INTO semantic_concepts (concept_key, category, variants_json, learned_from, usage_count, last_updated)
               VALUES (?, ?, ?, 'system', 0, ?)`,
              [seed.key.toLowerCase(), seed.category, JSON.stringify(seed.variants), now]
            );
          }
        });
      }

      // Load all concepts into in-memory fast lookup graph
      const rows = await db.getAllAsync<{ concept_key: string; variants_json: string }>(
        'SELECT concept_key, variants_json FROM semantic_concepts'
      );

      const newGraph = new Map<string, Set<string>>();
      for (const row of rows) {
        const key = row.concept_key.toLowerCase();
        let variants: string[] = [];
        try {
          variants = JSON.parse(row.variants_json);
        } catch {
          variants = [];
        }

        if (!newGraph.has(key)) newGraph.set(key, new Set());
        const keySet = newGraph.get(key)!;
        keySet.add(key);

        for (const v of variants) {
          const vLower = v.toLowerCase().trim();
          if (vLower) {
            keySet.add(vLower);
            // Bidirectional link
            if (!newGraph.has(vLower)) newGraph.set(vLower, new Set());
            newGraph.get(vLower)!.add(key);
            newGraph.get(vLower)!.add(vLower);
          }
        }
      }

      inMemorySemanticGraph = newGraph;
      isGraphLoaded = true;
    } catch (err) {
      console.warn('[SemanticKnowledge] Failed to load semantic knowledge graph:', err);
    }
  })();

  return initPromise;
}

/**
 * Returns dynamic semantic concept variants for any given word (O(1) memory lookup).
 */
export function getDynamicConceptVariants(word: string): string[] {
  if (!word) return [];
  const clean = word.toLowerCase().trim();
  const variants = new Set<string>();
  variants.add(clean);

  const matched = inMemorySemanticGraph.get(clean);
  if (matched) {
    for (const v of matched) {
      variants.add(v);
    }
  }

  return Array.from(variants);
}

// Pending batch queue for SQLite writes
let pendingLearnedUpdates: Map<string, { category: string; variants: Set<string> }> = new Map();
let isFlushScheduled = false;

async function flushLearnedUpdates(): Promise<void> {
  if (pendingLearnedUpdates.size === 0) return;
  const toFlush = new Map(pendingLearnedUpdates);
  pendingLearnedUpdates.clear();

  try {
    const db = await getDatabase();
    const now = new Date().toISOString();

    for (const [key, item] of toFlush) {
      const existing = await db.getFirstAsync<{ variants_json: string; usage_count: number }>(
        'SELECT variants_json, usage_count FROM semantic_concepts WHERE concept_key = ?',
        [key]
      );

      let mergedVariants = new Set<string>(item.variants);
      let usage = 1;

      if (existing) {
        usage = (existing.usage_count || 0) + 1;
        try {
          const oldVars: string[] = JSON.parse(existing.variants_json);
          for (const ov of oldVars) mergedVariants.add(ov);
        } catch {
          // ignore
        }
      }

      const variantsArray = Array.from(mergedVariants);

      await db.runAsync(
        `INSERT INTO semantic_concepts (concept_key, category, variants_json, learned_from, usage_count, last_updated)
         VALUES (?, ?, ?, 'auto_inferred', ?, ?)
         ON CONFLICT(concept_key) DO UPDATE SET
           variants_json = excluded.variants_json,
           usage_count = semantic_concepts.usage_count + 1,
           last_updated = excluded.last_updated`,
        [key, item.category, JSON.stringify(variantsArray), usage, now]
      );
    }
  } catch (err) {
    console.warn('[SemanticKnowledge] Error flushing learned updates to DB:', err);
  }
}

/**
 * Continuous Learning: Analyzes indexed document text, recognizes document signatures,
 * updates in-memory graph immediately (0ms latency), and asynchronously batches DB writes.
 */
export async function learnFromDocumentText(text: string, fileName: string): Promise<void> {
  if (!text && !fileName) return;

  const combined = `${fileName} ${text}`.toLowerCase();

  for (const sig of DOCUMENT_SIGNATURES) {
    const hasSignature = sig.triggers.some((trigger) => combined.includes(trigger.toLowerCase()));
    if (hasSignature) {
      // 1. Instant update to In-Memory Graph (0ms, 0 SQLite lock)
      if (!inMemorySemanticGraph.has(sig.primaryKey)) {
        inMemorySemanticGraph.set(sig.primaryKey, new Set());
      }
      const graphSet = inMemorySemanticGraph.get(sig.primaryKey)!;
      for (const v of sig.associatedVariants) {
        graphSet.add(v);
        if (!inMemorySemanticGraph.has(v)) inMemorySemanticGraph.set(v, new Set());
        inMemorySemanticGraph.get(v)!.add(sig.primaryKey);
      }

      // 2. Queue for background non-blocking flush
      if (!pendingLearnedUpdates.has(sig.primaryKey)) {
        pendingLearnedUpdates.set(sig.primaryKey, {
          category: sig.category,
          variants: new Set(sig.associatedVariants)
        });
      } else {
        const entry = pendingLearnedUpdates.get(sig.primaryKey)!;
        for (const v of sig.associatedVariants) entry.variants.add(v);
      }
    }
  }

  // Schedule background flush if not already scheduled
  if (!isFlushScheduled && pendingLearnedUpdates.size > 0) {
    isFlushScheduled = true;
    setTimeout(() => {
      isFlushScheduled = false;
      flushLearnedUpdates().catch(() => {});
    }, 4000);
  }
}
