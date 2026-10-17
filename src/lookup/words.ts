/** Một mẩu của câu: từ (bấm được) hoặc khoảng trắng / dấu câu. */
export interface Part {
  text: string;
  word: boolean;
}

const segmenters = new Map<string, Intl.Segmenter>();

/**
 * Tách câu thành từ theo ngôn ngữ (Intl.Segmenter: đúng cả với "don't",
 * tiếng Nhật/Trung không có dấu cách); dấu câu và khoảng trắng giữ nguyên.
 */
export function splitWords(text: string, lang = 'en'): Part[] {
  let seg = segmenters.get(lang);
  if (!seg) {
    try {
      seg = new Intl.Segmenter(lang, { granularity: 'word' });
    } catch {
      seg = new Intl.Segmenter('en', { granularity: 'word' });
    }
    segmenters.set(lang, seg);
  }
  const parts: Part[] = [];
  for (const s of seg.segment(text)) {
    const word = !!s.isWordLike;
    const last = parts.at(-1);
    // Gộp các mẩu không phải từ liền nhau (", " → một mẩu).
    if (!word && last && !last.word) last.text += s.segment;
    else parts.push({ text: s.segment, word });
  }
  return parts;
}

/** Chuỗi gốc từ mẩu i tới mẩu j (gồm cả khoảng trắng / dấu giữa), bỏ dấu câu ở hai đầu. */
export function joinParts(parts: readonly Part[], i: number, j: number): string {
  const [a, b] = i <= j ? [i, j] : [j, i];
  return parts
    .slice(a, b + 1)
    .map((p) => p.text)
    .join('')
    .trim();
}
