/** Bất kỳ thứ gì có khoảng thời gian (câu, dòng hiển thị). */
export interface Timed {
  startMs: number;
  endMs: number;
}

/** Giữ câu thêm một chút sau endMs để mắt kịp đọc, nếu câu kế chưa tới. */
export const HOLD_MS = 600;

/**
 * Chỉ số câu đang hiển thị tại thời điểm `tMs`, hoặc -1.
 * `sentences` phải sắp theo startMs tăng dần.
 */
export function findActive(sentences: readonly Timed[], tMs: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid]!.startMs <= tMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return -1;
  const s = sentences[idx]!;
  const next = sentences[idx + 1];
  const until = Math.min(s.endMs + HOLD_MS, next ? next.startMs : Infinity);
  return tMs < until ? idx : -1;
}

/** Chỉ số câu cuối cùng đã bắt đầu tại tMs (0 nếu chưa câu nào), dùng để lập lịch dịch. */
export function startedIndex(sentences: readonly Timed[], tMs: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid]!.startMs <= tMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}
