import type { Piece, Token } from './types';

/** Ngôn ngữ không dùng dấu cách giữa các từ. */
export function isSpaceless(lang: string | null | undefined): boolean {
  return /^(zh|ja|th|lo|km|my|yue)\b/i.test(lang ?? '');
}

const CLOSING = /^[.,!?;:)\]}%…»”’。，、！？；：）」』]/;

/** Nối 2 chuỗi mà không bao giờ làm dính chữ (sửa W1). */
export function joinText(a: string, b: string, lang?: string | null): string {
  if (!a) return b;
  if (!b) return a;
  if (/\s$/.test(a) || /^\s/.test(b) || isSpaceless(lang) || CLOSING.test(b)) return a + b;
  return a + ' ' + b;
}

/**
 * Tách mảnh thành token theo khoảng trắng; thời gian trong mảnh chia theo tỉ lệ
 * ký tự (phụ đề người làm thường chỉ có mốc cho cả event).
 * Ngôn ngữ không dấu cách: tách sau dấu kết câu để bộ chia câu cắt được.
 */
export function tokenize(pieces: Piece[], lang?: string | null): Token[] {
  const spaceless = isSpaceless(lang);
  const tokens: Token[] = [];

  for (const piece of pieces) {
    const raw = piece.text.replace(/\s+/g, ' ');
    const parts: { text: string; offset: number; spaceBefore: boolean }[] = [];
    const re = spaceless ? /[^\s。！？!?…]*[。！？!?…]+|[^\s。！？!?…]+/g : /\[[^\]]*\]|\S+/g;
    for (let m: RegExpExecArray | null; (m = re.exec(raw)); ) {
      // Token đầu mảnh không có khoảng trắng phía trước = ranh giới giữa 2
      // mảnh dính liền (ca W1): chèn dấu cách theo quy tắc của joinText.
      const atGluedBoundary = parts.length === 0 && m.index === 0;
      const spaceBefore = spaceless
        ? false
        : atGluedBoundary
          ? !CLOSING.test(m[0])
          : raw[m.index - 1] === ' ';
      parts.push({ text: m[0], offset: m.index, spaceBefore });
    }

    // Tính tỉ lệ trên phần chữ thật, bỏ khoảng trắng đầu/cuối (seg ASR có dạng
    // " word"), để từ đầu mảnh luôn bắt đầu đúng mốc của mảnh.
    const lead = raw.length - raw.trimStart().length;
    const len = Math.max(raw.trim().length, 1);
    const dur = piece.endMs - piece.startMs;
    parts.forEach((p, i) => {
      const startMs = piece.startMs + Math.round((dur * (p.offset - lead)) / len);
      const nextOffset = i + 1 < parts.length ? parts[i + 1]!.offset - lead : len;
      const endMs = piece.startMs + Math.round((dur * nextOffset) / len);
      tokens.push({ text: p.text, startMs, endMs, spaceBefore: tokens.length > 0 && p.spaceBefore });
    });
  }
  return tokens;
}

export function tokensToText(tokens: Token[]): string {
  return tokens.map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.text).join('');
}
