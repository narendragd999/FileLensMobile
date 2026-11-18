/**
 * textChunker.ts — Breaks document & OCR text into semantic chunks for vector embeddings.
 *
 * Preserves sentence boundaries, paragraph structures, and page markers ([Page X]).
 */

export interface TextChunk {
  index: number;
  text: string;
  pageNumber: number;
}

const DEFAULT_CHUNK_SIZE = 350; // characters (~50-70 words)
const DEFAULT_CHUNK_OVERLAP = 60; // overlap to preserve context across boundaries

/**
 * Splits text into overlapping semantic chunks, tracking page numbers from [Page X] tags.
 */
export function chunkText(
  fullText: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): TextChunk[] {
  if (!fullText || !fullText.trim()) {
    return [];
  }

  const cleanText = fullText.replace(/\r\n/g, '\n').trim();
  const chunks: TextChunk[] = [];

  // Match all page tags and their indices
  const pageMatches = [...cleanText.matchAll(/\[Page (\d+)\]/g)];

  const getPageForIndex = (charIndex: number): number => {
    let page = 1;
    for (const pm of pageMatches) {
      if (pm.index !== undefined && pm.index <= charIndex) {
        page = parseInt(pm[1], 10);
      } else {
        break;
      }
    }
    return page;
  };

  // Split text by paragraphs first
  const paragraphs = cleanText.split(/\n\s*\n/);
  let currentBuffer = '';
  let currentStartIndex = 0;
  let charOffset = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) {
      charOffset += para.length + 2;
      continue;
    }

    // If adding this paragraph exceeds chunk size and buffer is not empty, flush buffer
    if (currentBuffer.length > 0 && currentBuffer.length + trimmedPara.length > chunkSize) {
      const page = getPageForIndex(currentStartIndex);
      chunks.push({
        index: chunkIndex++,
        text: currentBuffer.trim(),
        pageNumber: page,
      });

      // Compute overlap from end of current buffer
      const overlapText = currentBuffer.slice(-overlap);
      currentBuffer = overlapText + ' ' + trimmedPara;
      currentStartIndex = Math.max(0, charOffset - overlap);
    } else {
      if (currentBuffer.length === 0) {
        currentStartIndex = charOffset;
        currentBuffer = trimmedPara;
      } else {
        currentBuffer += '\n' + trimmedPara;
      }
    }

    // If single paragraph itself is larger than chunkSize, break it by sentences
    if (currentBuffer.length > chunkSize * 1.5) {
      const sentences = currentBuffer.split(/(?<=[.!?।॥\n])\s+/);
      let subBuffer = '';
      let subStartIndex = currentStartIndex;

      for (const sentence of sentences) {
        if (subBuffer.length + sentence.length > chunkSize && subBuffer.length > 0) {
          const page = getPageForIndex(subStartIndex);
          chunks.push({
            index: chunkIndex++,
            text: subBuffer.trim(),
            pageNumber: page,
          });
          subBuffer = sentence;
          subStartIndex += subBuffer.length;
        } else {
          subBuffer = subBuffer ? subBuffer + ' ' + sentence : sentence;
        }
      }
      currentBuffer = subBuffer;
      currentStartIndex = subStartIndex;
    }

    charOffset += para.length + 2;
  }

  // Flush remaining buffer
  if (currentBuffer.trim().length > 0) {
    const page = getPageForIndex(currentStartIndex);
    chunks.push({
      index: chunkIndex++,
      text: currentBuffer.trim(),
      pageNumber: page,
    });
  }

  return chunks;
}
