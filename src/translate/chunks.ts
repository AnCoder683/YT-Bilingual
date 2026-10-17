import type { Transcript } from '../transcript';

/** Một đoạn transcript gửi cho Claude trong một request; Claude tự chia thành phụ đề. */
export interface Chunk {
  index: number;
  /** Khoảng câu heuristic [sentStart, sentEnd). */
  sentStart: number;
  sentEnd: number;
  /** Khoảng token [tokStart, tokEnd). */
  tokStart: number;
  tokEnd: number;
  startMs: number;
  endMs: number;
}

/** Cỡ đoạn tính theo số token (từ, hoặc âm tiết với tiếng Việt). */
export const WORDS_MIN = 120;
export const WORDS_MAX = 180;

const TERMINAL = /[.?!…。？！]["'”’)\]」』]*$/;

export function makeChunks(t: Transcript): Chunk[] {
  const { sentences } = t;
  const cuts: number[] = []; // chỉ số câu bắt đầu mỗi đoạn

  // Cắt ở ranh giới câu heuristic trong vùng [WORDS_MIN, WORDS_MAX] từ:
  // ưu tiên sau dấu kết câu (phụ đề người làm), rồi khoảng lặng lớn nhất
  // (ASR), để hiếm khi cắt giữa một câu nói.
  let start = 0;
  while (start < sentences.length) {
    cuts.push(start);
    const base = sentences[start]!.tokStart;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = start; i < sentences.length; i++) {
      const words = sentences[i]!.tokEnd - base;
      if (words > WORDS_MAX && best > 0) break;
      if (words >= WORDS_MIN) {
        const next = sentences[i + 1];
        const gap = next ? next.startMs - sentences[i]!.endMs : Infinity;
        const score = gap + (TERMINAL.test(sentences[i]!.text) ? 10_000 : 0);
        if (score >= bestScore) {
          bestScore = score;
          best = i + 1;
        }
        if (words > WORDS_MAX) break;
      }
    }
    // Phần còn lại ngắn hơn WORDS_MIN thành đoạn cuối; nếu sau chỗ cắt chỉ
    // còn một mẩu (< WORDS_MIN/2) thì gộp luôn, đỡ tốn một request.
    const cutAt = sentences[best]; // undefined khi chỗ cắt tốt nhất là cuối transcript
    const rest = cutAt ? sentences.at(-1)!.tokEnd - cutAt.tokStart : 0;
    start = cutAt && rest >= WORDS_MIN / 2 ? best : sentences.length;
  }

  return cuts.map((sentStart, index) => {
    const sentEnd = cuts[index + 1] ?? sentences.length;
    const first = sentences[sentStart]!;
    const last = sentences[sentEnd - 1]!;
    return {
      index,
      sentStart,
      sentEnd,
      tokStart: first.tokStart,
      tokEnd: last.tokEnd,
      startMs: first.startMs,
      endMs: last.endMs,
    };
  });
}

/** Chỉ số đoạn chứa thời điểm tMs (đoạn cuối đã bắt đầu; 0 nếu chưa tới đoạn nào). */
export function chunkAt(chunks: readonly Chunk[], tMs: number): number {
  let lo = 0;
  let hi = chunks.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chunks[mid]!.startMs <= tMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

/** Băm ngắn (FNV-1a 32-bit) nội dung đoạn để làm khóa cache. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}:${text.length}`;
}
