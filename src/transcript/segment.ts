import { tokensToText } from './join';
import type { Sentence, Token } from './types';

export interface SegmentOptions {
  /** Khoảng lặng giữa 2 token coi là hết câu. */
  gapMs?: number;
  maxMs?: number;
  maxChars?: number;
}

const TERMINAL = /[.?!…。？！]+["'”’)\]」』]*$/;
const ABBREV = /^(mr|mrs|ms|dr|st|vs|etc|e\.g|i\.e|u\.s|no|jr|sr|ông|bà|tp)\.$/i;
const SOFT_BREAK = /[,;:，、；：—–-]$/;
const BRACKET_ONLY = /^\[[^\]]*\]$/;

function endsSentence(t: Token): boolean {
  return TERMINAL.test(t.text) && !ABBREV.test(t.text);
}

/** Track có dấu câu thật (phụ đề người làm) hay ASR không dấu câu. */
export function isPunctuated(tokens: Token[]): boolean {
  if (tokens.length < 20) return tokens.some(endsSentence);
  const ends = tokens.filter(endsSentence).length;
  return ends / tokens.length > 1 / 40;
}

/**
 * Chia token thành câu (sửa W2). Thứ tự ưu tiên:
 * 1. dấu kết câu; 2. khoảng lặng ≥ gapMs; 3. quá dài → cắt ở chỗ nghỉ tốt nhất.
 * Chỉ cắt giữa 2 token, không bao giờ cắt trong một từ.
 */
export function segment(tokens: Token[], opts: SegmentOptions = {}): Sentence[] {
  const punctuated = isPunctuated(tokens);
  // Track có dấu câu: khoảng lặng chỉ là tín hiệu yếu, nâng ngưỡng.
  const gapMs = opts.gapMs ?? (punctuated ? 2000 : 700);
  const maxMs = opts.maxMs ?? 12_000;
  const maxChars = opts.maxChars ?? 120;

  const out: Sentence[] = [];
  let cur: Token[] = [];
  const index = new Map(tokens.map((t, i) => [t, i]));

  const emit = (toks: Token[]) => {
    if (!toks.length) return;
    const text = tokensToText(toks).trim();
    if (!text) return;
    out.push({
      id: out.length,
      text,
      startMs: toks[0]!.startMs,
      endMs: toks.at(-1)!.endMs,
      tokStart: index.get(toks[0]!)!,
      tokEnd: index.get(toks.at(-1)!)! + 1,
    });
  };

  const tooLong = (toks: Token[], factor = 1) =>
    toks.length > 1 &&
    (toks.at(-1)!.endMs - toks[0]!.startMs > maxMs * factor ||
      tokensToText(toks).length > maxChars * factor);
  // Track có dấu câu: giữ trọn câu quan trọng hơn cho việc dịch (W2), nên cho
  // phép câu dài hơn giới hạn một chút trước khi cắt.
  const limitFactor = punctuated ? 1.5 : 1;

  /**
   * Chọn chỗ cắt: khoảng nghỉ thật dài nhất (ưu tiên sau dấu phẩy), nhưng
   * nửa đầu phải đủ dài (≥ 30% giới hạn) để không sinh mẩu vụn.
   */
  const bestCut = (toks: Token[]): number => {
    const minLeft = maxChars * 0.3;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 1; i < toks.length - 1; i++) {
      if (tokensToText(toks.slice(0, i)).length < minLeft) continue;
      const gap = toks[i]!.startMs - toks[i - 1]!.endMs;
      const score = gap + (SOFT_BREAK.test(toks[i - 1]!.text) ? 800 : 0);
      if (score >= bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best > 0 ? best : Math.max(1, toks.length - 1);
  };

  for (const tok of tokens) {
    const prev = cur[cur.length - 1];
    if (prev && tok.startMs - prev.endMs >= gapMs) {
      emit(cur);
      cur = [];
    }
    if (BRACKET_ONLY.test(tok.text)) {
      emit(cur);
      emit([tok]);
      cur = [];
      continue;
    }
    cur.push(tok);
    if (endsSentence(tok)) {
      // Câu kết bằng dấu câu nhưng quá dài: vẫn chia nhỏ.
      while (tooLong(cur, limitFactor)) {
        const cut = bestCut(cur);
        emit(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
      emit(cur);
      cur = [];
    } else if (tooLong(cur, limitFactor)) {
      const cut = bestCut(cur);
      emit(cur.slice(0, cut));
      cur = cur.slice(cut);
    }
  }
  emit(cur);
  return out;
}
