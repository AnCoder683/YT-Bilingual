import { HOLD_MS, type Timed } from './overlay/active';

/** Tua tới sớm hơn đầu câu một chút để không mất âm đầu của từ đầu tiên. */
export const LEAD_MS = 50;
/**
 * Xem như đã tới câu sớm hơn chừng này: vừa tua về trước đầu câu LEAD_MS (cộng
 * sai số làm tròn của currentTime) thì tính là đang ở câu đích. Dùng khi hiển
 * thị lúc video dừng, khi chọn câu để tự dừng và để chuyển câu.
 */
export const PAUSED_LOOKAHEAD_MS = LEAD_MS + 5;
/**
 * Tự dừng sớm hơn cuối câu chừng này, để lúc dừng (cộng PAUSED_LOOKAHEAD_MS)
 * màn hình vẫn là câu vừa nghe, không nhảy sang câu nối liền sau nó.
 */
export const PAUSE_EARLY_MS = 80;
/** Thời gian nhảy hơn chừng này giữa hai lần update thì coi là tua. */
const JUMP_MS = 500;

export type NavDir = 'prev' | 'next' | 'repeat';

/** Chỉ số câu cuối cùng đã bắt đầu tại tMs, hoặc -1. */
export function lastStarted(lines: readonly Timed[], tMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.startMs <= tMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return idx;
}

/**
 * Thời điểm (ms) cần tua tới cho phím tắt theo câu, hoặc null nếu không có câu nào.
 * - prev: đang trong câu thì về câu trước; đang ở khoảng lặng thì về câu vừa nói.
 * - next: câu kế tiếp.
 * - repeat: đầu câu hiện tại (hoặc câu vừa nói).
 */
export function navTarget(lines: readonly Timed[], tMs: number, dir: NavDir): number | null {
  if (!lines.length) return null;
  const i = lastStarted(lines, tMs + PAUSED_LOOKAHEAD_MS);
  let to: number;
  if (dir === 'next') {
    to = i + 1;
  } else if (i < 0) {
    to = 0;
  } else if (dir === 'repeat') {
    to = i;
  } else {
    const inLine = tMs < lines[i]!.endMs + HOLD_MS;
    to = inLine ? i - 1 : i;
  }
  const line = lines[Math.max(0, to)];
  return line ? Math.max(0, line.startMs - LEAD_MS) : null;
}

/**
 * Chế độ tự dừng sau mỗi câu. Gọi `update` mỗi khung hình khi video đang phát;
 * trả true khi vừa hết một câu (kể cả khi câu sau nối liền ngay).
 */
export class AutoPause {
  /** endMs (đã cắt tại đầu câu sau) và startMs của câu đang phát. */
  private watchEnd: number | null = null;
  private watchStart = 0;
  /** startMs của câu vừa dừng xong, để ghim câu đó trên màn hình khi đang dừng. */
  pausedStart: number | null = null;
  /** endMs của câu vừa dừng, để phát tiếp thì không dừng lại vì chính nó. */
  private doneEnd: number | null = null;
  private lastT: number | null = null;

  /** Gọi khi người dùng tua: quên câu đang dở; nghe lại câu vừa dừng thì dừng lại lần nữa. */
  reset(): void {
    this.watchEnd = null;
    this.doneEnd = null;
    this.lastT = null;
  }

  update(lines: readonly Timed[], tMs: number): boolean {
    // Tua (phím của extension hay của YouTube): sự kiện `seeking` tới sau khung
    // hình đầu tiên ở vị trí mới, nên tự nhận ra bước nhảy để không dừng nhầm
    // vì câu cũ.
    const last = this.lastT;
    this.lastT = tMs;
    if (last !== null && (tMs < last || tMs - last > JUMP_MS)) {
      this.watchEnd = null;
      this.doneEnd = null;
    }
    const end = this.watchEnd;
    if (end !== null) {
      const at = end - PAUSE_EARLY_MS;
      if (tMs >= at) {
        this.watchEnd = null;
        this.doneEnd = end;
        this.pausedStart = this.watchStart;
        return true;
      }
      if (tMs < at) return false; // còn trong câu đang theo dõi
    }
    // Sau khi tua về trước đầu câu một chút thì theo dõi câu đó, không phải
    // câu nối liền trước nó (sắp hết, sẽ dừng ngay).
    const i = lastStarted(lines, tMs + PAUSED_LOOKAHEAD_MS);
    if (i < 0) {
      this.watchEnd = null;
      return false;
    }
    // Câu chồng lên câu sau (thường gặp với ASR) thì xem như hết khi câu sau
    // bắt đầu, giống cách hiển thị, để lúc dừng vẫn thấy câu vừa nghe.
    const lineEnd = Math.min(lines[i]!.endMs, lines[i + 1]?.startMs ?? Infinity);
    const watch = tMs < lineEnd - PAUSE_EARLY_MS && lineEnd !== this.doneEnd;
    this.watchEnd = watch ? lineEnd : null;
    this.watchStart = lines[i]!.startMs;
    return false;
  }
}
