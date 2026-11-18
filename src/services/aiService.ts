import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export const AI_API_URL_KEY = 'AI_API_URL';
export const AI_API_KEY_KEY = 'AI_API_KEY';
export const AI_MODEL_KEY = 'AI_MODEL';
export const AI_AGREEMENT_KEY = 'AI_AGREEMENT_ACCEPTED';

export const DEFAULT_AI_URL = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_AI_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

export const AI_PRESETS = [
  { name: 'NVIDIA NIM', url: 'https://integrate.api.nvidia.com/v1', model: 'nvidia/nemotron-3-ultra-550b-a55b' },
  { name: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { name: 'Gemini (Google)', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-3.7-flash' },
  { name: 'Claude (OpenRouter)', url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet' },
  { name: 'xAI (Grok)', url: 'https://api.x.ai/v1', model: 'grok-2-latest' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama3-70b-8192' },
  { name: 'Together AI', url: 'https://api.together.xyz/v1', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo' },
  { name: 'Local (LM Studio)', url: 'http://10.0.2.2:1234/v1', model: 'local-model' },
];

export interface AiConfig {
  url: string;
  key: string;
  model: string;
  agreed: boolean;
}

export async function getAiConfig(): Promise<AiConfig> {
  const url = await AsyncStorage.getItem(AI_API_URL_KEY) || DEFAULT_AI_URL;
  const key = await AsyncStorage.getItem(AI_API_KEY_KEY) || '';
  const model = await AsyncStorage.getItem(AI_MODEL_KEY) || DEFAULT_AI_MODEL;
  const agreedStr = await AsyncStorage.getItem(AI_AGREEMENT_KEY);
  return {
    url,
    key,
    model,
    agreed: agreedStr === 'true'
  };
}

export async function saveAiConfig(url: string, key: string, model: string): Promise<void> {
  await AsyncStorage.setItem(AI_API_URL_KEY, url);
  await AsyncStorage.setItem(AI_API_KEY_KEY, key);
  await AsyncStorage.setItem(AI_MODEL_KEY, model);
}

export async function acceptAiAgreement(): Promise<void> {
  await AsyncStorage.setItem(AI_AGREEMENT_KEY, 'true');
}

/**
 * Sends text to the OpenAI-compatible endpoint and returns structured output.
 */
export async function structureOcrText(
  text: string, 
  format: 'csv' | 'markdown', 
  overrideConfig?: { url: string, model: string },
  imageUri?: string
): Promise<string> {
  let config = await getAiConfig();
  
  if (overrideConfig) {
    config = { ...config, url: overrideConfig.url, model: overrideConfig.model };
  }

  if (!config.agreed) {
    throw new Error('Privacy agreement not accepted.');
  }
  if (!config.key) {
    throw new Error('API Key is missing. Please set it in Settings.');
  }

  const MAX_CHUNK_LENGTH = 12000; // Roughly ~3000 tokens per chunk
  const chunks = [];
  if (text.length > MAX_CHUNK_LENGTH) {
    for (let i = 0; i < text.length; i += MAX_CHUNK_LENGTH) {
      chunks.push(text.slice(i, i + MAX_CHUNK_LENGTH));
    }
  } else {
    chunks.push(text);
  }

  let finalResult = '';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isSubsequentChunk = i > 0;

    let prompt = '';
    if (format === 'csv') {
      prompt = `You are an expert data extraction assistant. I will provide raw OCR text from a document. Your task is to extract tabular or structured data and output it as pure CSV format. Do not include any markdown blocks (like \`\`\`csv) or conversational text. Just output the raw CSV lines.`;
      if (isSubsequentChunk) {
        prompt += `\nCRITICAL: This is a continuation chunk. Do NOT output a header row for this CSV. Only output the data rows.`;
      } else {
        prompt += ` If it's a receipt, include columns like Item, Quantity, Price. If it's an ID, use Field, Value.`;
      }
      prompt += `\n\nRAW TEXT:\n${chunk}`;
    } else {
      prompt = `You are an expert document formatting assistant. I will provide raw OCR text. Reformat it into a highly readable and clean Markdown document. Correct obvious OCR typos but do not hallucinate missing information. Use headings, lists, and tables where appropriate.\n\nRAW TEXT:\n${chunk}`;
    }
    // Load image as base64 if provided, but only attach it to the FIRST chunk
    let base64Image: string | null = null;
    if (imageUri && i === 0) {
      try {
        base64Image = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
      } catch (e) {
        console.warn('Failed to read imageUri as base64:', e);
      }
    }

    // Construct the payload content
    let messageContent: any = prompt;
    if (base64Image) {
      messageContent = [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
      ];
    }

    const requestUrl = config.url.endsWith('/') ? `${config.url}chat/completions` : `${config.url}/chat/completions`;

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'user', content: messageContent }
        ],
        temperature: 0.2, // Low temp for more deterministic extraction
      })
    });

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson.error?.message || JSON.stringify(errJson);
      } catch (e) {
        errText = response.statusText;
      }
      throw new Error(`AI API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let resultText = data.choices?.[0]?.message?.content || '';
    
    // Clean up any potential markdown backticks that models stubbornly output
    if (format === 'csv') {
      resultText = resultText.replace(/^```csv\s*/gi, '').replace(/^```\s*/gi, '').replace(/\s*```$/gi, '');
    }

    if (finalResult.length > 0) {
      finalResult += '\n';
    }
    finalResult += resultText.trim();

    // Delay 1 second to avoid rate limits between chunks
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return finalResult;
}
