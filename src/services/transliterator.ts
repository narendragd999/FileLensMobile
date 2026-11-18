/**
 * transliterator.ts — English → Hindi (Devanagari) transliteration.
 *
 * This is a port of the desktop FileLensPro `ui/hindi_keyboard.py::transliterate()`.
 * It uses Google Input Tools API (online) with an offline phonetic
 * dictionary fallback.
 *
 * API: https://inputtools.google.com/request?text=<text>&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8
 * Returns: ["SUCCESS", [["<input>", ["<suggestion>"]]]]
 */

const INPUT_TOOLS_URL =
  'https://inputtools.google.com/request?text={text}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8';
const REQUEST_TIMEOUT = 4000;

/** 80+ common English→Hindi word mappings for offline fallback */
const TRANSLIT_MAP: Record<string, string> = {
  main: 'मैं', mein: 'मैं', hum: 'हम', tu: 'तू', tum: 'तुम',
  aap: 'आप', woh: 'वह', wo: 'वह', yeh: 'यह', ye: 'यह',
  vo: 'वह', ham: 'हम', hai: 'है', hain: 'हैं', tha: 'था',
  thi: 'थी', the: 'थे', ho: 'हो', hoga: 'होगा', hogi: 'होगी',
  karna: 'करना', karo: 'करो', kiya: 'किया', karta: 'करता',
  jana: 'जाना', jao: 'जाओ', gaya: 'गया', gayi: 'गयी',
  aana: 'आना', aao: 'आओ', aaya: 'आया', aayi: 'आयी',
  dena: 'देना', do: 'दो', diya: 'दिया', di: 'दी',
  lena: 'लेना', lo: 'लो', liya: 'लिया', li: 'ली',
  dekhna: 'देखना', dekho: 'देखो', dekha: 'देखा',
  bolna: 'बोलना', bolo: 'बोलो', bola: 'बोला',
  kya: 'क्या', kab: 'कब', kahan: 'कहाँ', kaise: 'कैसे',
  kyon: 'क्यों', kaun: 'कौन', kitna: 'कितना', kitni: 'कितनी',
  naam: 'नाम', kaam: 'काम', ghar: 'घर', paani: 'पानी',
  khana: 'खाना', dost: 'दोस्त', yaar: 'यार', baat: 'बात',
  zindagi: 'ज़िंदगी', duniya: 'दुनिया', pyaar: 'प्यार',
  mohabbat: 'मोहब्बत', dil: 'दिल', samay: 'समय', waqt: 'वक़्त',
  din: 'दिन', raat: 'रात', subah: 'सुबह', shaam: 'शाम',
  saal: 'साल', mahina: 'महीना', hafta: 'हफ़्ता',
  namaste: 'नमस्ते', namaskar: 'नमस्कार', shukriya: 'शुक्रिया',
  dhanyavad: 'धन्यवाद', salaam: 'सलाम', ramram: 'रामराम',
  yahan: 'यहाँ', vahan: 'वहाँ', upar: 'ऊपर', neeche: 'नीचे',
  andar: 'अंदर', bahar: 'बाहर', aage: 'आगे', piche: 'पीछे',
  accha: 'अच्छा', acchi: 'अच्छी', bura: 'बुरा', buri: 'बुरी',
  bada: 'बड़ा', badi: 'बड़ी', chhota: 'छोटा', chhoti: 'छोटी',
  naya: 'नया', nayi: 'नयी', purana: 'पुराना', purani: 'पुरानी',
  sundar: 'सुंदर', kaala: 'काला', laal: 'लाल',
  aur: 'और', ya: 'या', lekin: 'लेकिन', par: 'पर',
  kyunki: 'क्योंकि', isliye: 'इसलिए', phir: 'फिर', ab: 'अब',
  tab: 'तब', jab: 'जब', to: 'तो', bhi: 'भी', hi: 'ही',
  sirf: 'सिर्फ़', sab: 'सब', kuch: 'कुछ', bahut: 'बहुत',
  thoda: 'थोड़ा', zyada: 'ज़्यादा',
  ek: 'एक', teen: 'तीन', char: 'चार', paanch: 'पाँच',
  saat: 'सात', aath: 'आठ', nau: 'नौ', das: 'दस',
  ram: 'राम', singh: 'सिंह', sisodiya: 'सिसोदिया',
  sharma: 'शर्मा', kumar: 'कुमार', verma: 'वर्मा',
  bharat: 'भारत', sarkar: 'सरकार', aadhar: 'आधार',
  praman: 'प्रमाण', patra: 'पत्र',
};

/**
 * Transliterate English text to Devanagari using Google Input Tools.
 * Falls back to an offline dictionary if the API is unavailable.
 */
export async function transliterate(
  text: string,
  useOnline: boolean = true
): Promise<string> {
  if (!text || !text.trim()) return text;

  if (useOnline) {
    try {
      const online = await transliterateOnline(text);
      if (online && online !== text) {
        // Verify the result contains Devanagari characters
        if (hasDevanagari(online)) return online;
      }
    } catch (e) {
      console.warn('[transliterate] Online failed, falling back to offline:', e);
    }
    return transliterateOffline(text);
  }
  return transliterateOffline(text);
}

/** Online: Google Input Tools API */
async function transliterateOnline(text: string): Promise<string> {
  const url = INPUT_TOOLS_URL.replace('{text}', encodeURIComponent(text));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FileLensPro-Mobile/1.0' },
    });
    if (!response.ok) return text;
    const data = await response.json();

    // Response shape: ["SUCCESS", [["<input>", ["<suggestion>"]]]]
    if (
      Array.isArray(data) &&
      data.length >= 2 &&
      data[0] === 'SUCCESS' &&
      Array.isArray(data[1]) &&
      data[1].length >= 1 &&
      Array.isArray(data[1][0]) &&
      data[1][0].length >= 2 &&
      Array.isArray(data[1][0][1]) &&
      data[1][0][1].length >= 1
    ) {
      return String(data[1][0][1][0]);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/** Offline: phonetic dictionary lookup */
function transliterateOffline(text: string): string {
  return text
    .split(' ')
    .map((word) => {
      // Strip leading/trailing punctuation for lookup
      let lead = '';
      let trail = '';
      let core = word;
      while (core.length > 0 && !/[a-zA-Z0-9]/.test(core[0])) {
        lead += core[0];
        core = core.slice(1);
      }
      while (core.length > 0 && !/[a-zA-Z0-9]/.test(core[core.length - 1])) {
        trail = core[core.length - 1] + trail;
        core = core.slice(0, -1);
      }
      const lookup = core.toLowerCase();
      const mapped = TRANSLIT_MAP[lookup] ?? core;
      return lead + mapped + trail;
    })
    .join(' ');
}

/** Check if text contains Devanagari Unicode characters (U+0900–U+097F) */
export function hasDevanagari(text: string): boolean {
  if (!text) return false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= 0x0900 && code <= 0x097f) return true;
  }
  return false;
}

/** Count Devanagari characters in text */
export function devanagariCharCount(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= 0x0900 && code <= 0x097f) count++;
  }
  return count;
}
