import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SemanticClassificationResult {
  title?: string;
  datetime?: string;
  todos: string[];
  discardedNoise: string[];
  contextNotes: string[];
}

export interface ModelDownloadProgress {
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
  status: 'idle' | 'downloading' | 'ready' | 'error';
  errorMessage?: string;
}

const STORAGE_KEY_AI_ENABLED = '@filelens_ai_semantic_enabled';
const MODEL_DIR = `${FileSystem.documentDirectory}ai_models/paraphrase-multilingual-MiniLM-L12-v2/`;
const MODEL_ONNX_FILE = `${MODEL_DIR}model_quantized.onnx`;
const TOKENIZER_FILE = `${MODEL_DIR}tokenizer.json`;

// HuggingFace Xenova distribution endpoints
const REMOTE_MODEL_URL =
  'https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/onnx/model_quantized.onnx';
const REMOTE_TOKENIZER_URL =
  'https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/tokenizer.json';

/**
 * Check if the semantic AI model files are downloaded locally
 */
export async function isModelDownloaded(): Promise<boolean> {
  try {
    const modelInfo = await FileSystem.getInfoAsync(MODEL_ONNX_FILE);
    return modelInfo.exists && !modelInfo.isDirectory && (modelInfo.size || 0) > 1000000;
  } catch {
    return false;
  }
}

/**
 * Check if the user has enabled semantic AI
 */
export async function isAiEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEY_AI_ENABLED);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Set semantic AI enabled preference
 */
export async function setAiEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_AI_ENABLED, enabled ? 'true' : 'false');
}

/**
 * Get total size of downloaded model files in MB
 */
export async function getModelSizeMb(): Promise<number> {
  try {
    const modelInfo = await FileSystem.getInfoAsync(MODEL_ONNX_FILE);
    if (modelInfo.exists && modelInfo.size) {
      return Math.round((modelInfo.size / (1024 * 1024)) * 10) / 10;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Delete the model to revert and free phone storage
 */
export async function deleteModel(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(MODEL_DIR, { idempotent: true });
    }
    await setAiEnabled(false);
  } catch (err) {
    console.warn('[SemanticAI] Failed to delete model:', err);
  }
}

/**
 * Download the model on demand with progress reporting
 */
export async function downloadModel(
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<boolean> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    }

    onProgress?.({
      totalBytes: 118308126,
      downloadedBytes: 0,
      percent: 0,
      status: 'downloading',
    });

    const downloadResumable = FileSystem.createDownloadResumable(
      REMOTE_MODEL_URL,
      MODEL_ONNX_FILE,
      {},
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite || 118308126;
        const current = downloadProgress.totalBytesWritten;
        const percent = Math.min(100, Math.round((current / total) * 100));
        onProgress?.({
          totalBytes: total,
          downloadedBytes: current,
          percent,
          status: 'downloading',
        });
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) {
      throw new Error('Model download did not return URI');
    }

    // Download tokenizer
    try {
      await FileSystem.downloadAsync(REMOTE_TOKENIZER_URL, TOKENIZER_FILE);
    } catch (tokErr) {
      console.warn('[SemanticAI] Tokenizer download notice:', tokErr);
    }

    await setAiEnabled(true);

    onProgress?.({
      totalBytes: 118308126,
      downloadedBytes: 118308126,
      percent: 100,
      status: 'ready',
    });

    return true;
  } catch (err: any) {
    console.error('[SemanticAI] Download error:', err);
    onProgress?.({
      totalBytes: 0,
      downloadedBytes: 0,
      percent: 0,
      status: 'error',
      errorMessage: err?.message || 'Download failed',
    });
    return false;
  }
}

let isAutoDownloading = false;

/**
 * Triggers an immediate, silent background download on app launch if missing
 */
export async function triggerAutoDownloadIfMissing(): Promise<void> {
  if (isAutoDownloading) return;
  try {
    const downloaded = await isModelDownloaded();
    if (downloaded) {
      await setAiEnabled(true);
      return;
    }
    isAutoDownloading = true;
    console.log('[SemanticAI] Auto-download initiated on app launch in background...');
    await downloadModel();
    console.log('[SemanticAI] Auto-download completed successfully in background!');
  } catch (err) {
    console.warn('[SemanticAI] Background auto-download silently deferred:', err);
  } finally {
    isAutoDownloading = false;
  }
}

// Relational subordinators that link background context to action directives
const RELATIONAL_JUNCTION_REGEX =
  /(?:(?<=[।!?;\n\r])|(?:\s+(?:जिसमें|जिसके तहत|जिसके अंतर्गत|अतः|ताकि|इसलिए|जिसके कारण|तदुपरांत|तत्पश्चात|wherein|whereby|therefore|so that|in order to)\s+))/i;

// Sentence terminators
const SENTENCE_SPLIT_REGEX = /[।!?;\n\r]+/;

/**
 * Decomposes complex paragraphs into logical semantic clauses
 */
export function segmentTextIntoSemanticClauses(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  const rawLines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const clauses: string[] = [];

  for (const line of rawLines) {
    // Check if line contains a relational boundary (like "जिसमें", "अतः", "ताकि")
    const subSegments = line
      .split(RELATIONAL_JUNCTION_REGEX)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sub of subSegments) {
      // Further split on sentence boundaries if any remain
      const sentences = sub
        .split(SENTENCE_SPLIT_REGEX)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const sent of sentences) {
        if (sent.length >= 3) {
          clauses.push(sent);
        }
      }
    }
  }

  return clauses;
}

/**
 * Universal Semantic Intent Classifier
 * Evaluates clauses against Action, Context, and Noise prototypes
 */
export function classifySemanticClauses(clauses: string[]): SemanticClassificationResult {
  const todos: string[] = [];
  const discardedNoise: string[] = [];
  const contextNotes: string[] = [];
  let extractedTitle: string | undefined;
  let extractedDatetime: string | undefined;

  // Intent Scoring Patterns for Multilingual Indian Administrative & Informal text
  const ACTION_INTENT_PATTERN =
    /(?:सुनिश्चित\s*करें|उपस्थिति\s*(?:दें|देना|कराएं|दर्ज)|कराएं|लाएं|प्रस्तुत\s*करें|जमा\s*करें|निस्तारण\s*करें|अवगत\s*कराएं|कार्रवाई\s*करें|उपस्थित\s*(?:रहें|हों|होना)|तैयार\s*रखें|भेजें|submit|attend|ensure|bring|provide|complete|inspect|present|report|mandatory|shall\s+be|directed\s+to)(?:[\s,;!।\-]|\P{L}|$)/ui;

  const BROADCAST_ATTENTION_PATTERN =
    /^(?:उपरोक्त\s*आदेश|समस्त\s*(?:कर्मचारी|अधिकारी|शिक्षक|साथी)|कृपया\s*ध्यान\s*दें|सर्वसाधारण\s*को\s*सूचित|ध्यान\s*दें|attention\s+please|notice\s+to|all\s+(?:employees|officers|staff)\s+to\s+note)(?:[\s,;!।\-]|\P{L}|$)/ui;

  const SENDER_METADATA_PATTERN =
    /^(?:msg\s+from|message\s+from|from\s*:?|ro\s*sir|deo\s*office|सादर|सस्नेह|धन्यवाद|भवदीय|शुभेच्छु|regards|thanks|sincerely)(?:[\s,;!।\-]|\P{L}|$)/ui;

  const EVENT_CONTEXT_PATTERN =
    /(?:समीक्षा\s*बैठक|बैठक\s*(?:आहुत|रखी|आयोजित)|अध्यक्षता\s*में|meeting|vc\s*रूम|सभागार|कक्ष\s*संख्या|कार्यशाला|प्रशिक्षण|सम्मेलन|अधिवेशन)(?:[\s,;!।\-]|\P{L}|$)/ui;

  for (const clause of clauses) {
    const trimmed = clause.trim();
    if (trimmed.length < 3) continue;

    // 1. Noise Filter: Sender attribution or transmission metadata
    if (SENDER_METADATA_PATTERN.test(trimmed) || /^(?:ro\s*sir|msg\s+from\b)/ui.test(trimmed)) {
      discardedNoise.push(trimmed);
      continue;
    }

    // 2. Noise Filter: Broad audience broadcast / attention hooks
    if (BROADCAST_ATTENTION_PATTERN.test(trimmed) && trimmed.length < 60) {
      discardedNoise.push(trimmed);
      continue;
    }

    // 3. Action Item: Direct imperative mandate / instruction
    if (ACTION_INTENT_PATTERN.test(trimmed)) {
      // Clean leading conjunctions if severed
      let cleanTask = trimmed
        .replace(/^(?:जिसमें|जिसके तहत|तथा|एवं|और|अतः|ताकि|कि)\s+/ui, '')
        .trim();

      todos.push(cleanTask);
      continue;
    }

    // 4. Event Context: Contains meeting/event details, venue, or time
    if (EVENT_CONTEXT_PATTERN.test(trimmed)) {
      contextNotes.push(trimmed);
      if (!extractedTitle) {
        // Extract a clean title from the meeting phrase
        extractedTitle = trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed;
      }
      continue;
    }

    // If it mentions date or time
    if (/(?:दिनांक|कल|today|tomorrow|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s*(?:am|pm|बजे))/ui.test(trimmed)) {
      contextNotes.push(trimmed);
      continue;
    }

    // Default short fragments: if imperative verb found anywhere, treat as task
    if (trimmed.length >= 10 && /(?:करें|करना|लाएं|भेजें|देना)/u.test(trimmed)) {
      todos.push(trimmed);
    } else {
      contextNotes.push(trimmed);
    }
  }

  return {
    title: extractedTitle,
    datetime: extractedDatetime,
    todos,
    discardedNoise,
    contextNotes,
  };
}
