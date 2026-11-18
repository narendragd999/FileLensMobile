// @ts-ignore
import krutiDevToUnicode from '@anthro-ai/krutidev-unicode';

export function convertKrutiDev(text: string): string {
  try {
    return krutiDevToUnicode(text);
  } catch (e) {
    return text;
  }
}

export function isLikelyKrutiDev(text: string): boolean {
  // A robust list of common Hindi words typed in DevLys / Kruti Dev 010
  const signatures = [
    'fnukad', 'Øekad', 'jktLFkku', 'ljdkj', 'ftyk', 'foHkkx', "vkns'k", 
    'LFkkiuk', 'dk;kZy;', 'mi;qDr', 'Lohd`r', "jkf'k", 'izsf"kfr', 
    'mDr', 'vuqikyuk', 'gLrk{kj', 'vf/kdkjh', 'd`i;k', 'fuosnu', 
    'egksn;', "fo'oklHkktu", 'lywEcj', 'if=dk', 'tkjh', 'izkf/kdkjh', 'fo"k;'
  ];
  
  for (const sig of signatures) {
    if (text.includes(sig)) {
      return true;
    }
  }
  return false;
}
