import {
  sendToBackground,
  type ChunkResult,
  type ErrorKind,
  type GlossaryEntry,
  type PartialMessage,
  type SubtitleOut,
  type TranslateRequest,
  type TranslateResponse,
} from './messages';
import type { TimedtextInfo } from './timedtext';
import { trackKey } from './timedtext';
import type { Transcript } from './transcript';
import { tokensToText } from './transcript/join';
import { chunkAt, fingerprint, makeChunks, type Chunk } from './translate/chunks';

/** Một dòng phụ đề song ngữ trên màn hình. */
export interface DisplayLine {
  startMs: number;
  endMs: number;
  source: string;
  translation: string | null;
}

/** Số đoạn dịch trước, tính cả đoạn đang xem. */
const LOOKAHEAD = 3;
const CONTEXT_LINES = 3;
const MAX_IN_FLIGHT = 2;
const RETRY_MS = 15_000;
const GLOSSARY_MAX = 80;
/** Số tóm tắt đoạn trước gửi kèm làm "story so far". */
const STORY_CHUNKS = 4;

/** Lỗi phải đợi người dùng sửa (key, tiền) thì dừng hẳn, không gọi lại. */
const FATAL: ReadonlySet<ErrorKind> = new Set(['no_key', 'auth', 'credit']);

type ChunkState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'done' }
  | { status: 'error'; retryAt: number; message: string };

/** Trạng thái đoạn đang xem, để báo cho người xem khi chưa có bản dịch. */
export type ChunkStatus = { kind: 'pending' } | { kind: 'error'; message: string } | null;

// reqId → Translator đang chờ request đó; content script chuyển PartialMessage vào đây.
const partialHandlers = new Map<string, (subs: SubtitleOut[]) => void>();
let reqSeq = 0;

export function handlePartial(msg: PartialMessage): void {
  partialHandlers.get(msg.reqId)?.(msg.subtitles);
}

/** Dòng hiển thị từ câu heuristic, khi chưa có bản dịch. */
export function heuristicLines(t: Transcript, from = 0, to = t.sentences.length): DisplayLine[] {
  return t.sentences.slice(from, to).map((s) => ({ startMs: s.startMs, endMs: s.endMs, source: s.text, translation: null }));
}

/**
 * Dịch transcript theo đoạn, ưu tiên đoạn đang xem và LOOKAHEAD đoạn sau
 * (chỉ trả tiền cho phần thật sự xem). Đoạn sau chỉ chạy khi đoạn trước đã
 * xong, để nó nhận được glossary + tóm tắt mới nhất. Với ASR, Claude chia
 * lại câu nên danh sách dòng hiển thị thay đổi khi từng đoạn dịch xong.
 */
export class Translator {
  readonly chunks: Chunk[];
  private states: ChunkState[];
  private results: (DisplayLine[] | null)[];
  /** Phụ đề đã nhận dần khi đang stream; bị thay bởi results khi xong. */
  private partials: (DisplayLine[] | null)[];
  private summaries: (string | null)[];
  private glossary = new Map<string, GlossaryEntry>();
  private flat: DisplayLine[] | null = null;
  private inFlight = 0;
  private wantFrom = 0;
  fatal: { kind: ErrorKind; message: string } | null = null;
  costUsd = 0;

  constructor(
    private info: TimedtextInfo,
    private transcript: Transcript,
    private targetLang: string,
    private title: () => string,
    private onUpdate: () => void,
  ) {
    this.chunks = makeChunks(transcript);
    this.states = this.chunks.map(() => ({ status: 'idle' }));
    this.results = this.chunks.map(() => null);
    this.partials = this.chunks.map(() => null);
    this.summaries = this.chunks.map(() => null);
  }

  /** Các dòng hiển thị, sắp theo thời gian (bản dịch nếu có, nếu không là câu gốc). */
  lines(): readonly DisplayLine[] {
    this.flat ??= this.chunks.flatMap(
      (c, i) => this.results[i] ?? this.partials[i] ?? heuristicLines(this.transcript, c.sentStart, c.sentEnd),
    );
    return this.flat;
  }

  statusAt(tMs: number): ChunkStatus {
    const st = this.states[chunkAt(this.chunks, tMs)];
    if (st?.status === 'pending') return { kind: 'pending' };
    if (st?.status === 'error') return { kind: 'error', message: st.message };
    return null;
  }

  /** Gọi mỗi khung hình với thời điểm hiện tại; rẻ khi không có gì mới. */
  ensureAround(tMs: number): void {
    this.wantFrom = chunkAt(this.chunks, tMs);
    this.pump();
  }

  private pump(): void {
    if (this.fatal) return;
    const now = Date.now();
    const end = Math.min(this.chunks.length, this.wantFrom + LOOKAHEAD);
    for (let c = this.wantFrom; c < end && this.inFlight < MAX_IN_FLIGHT; c++) {
      const st = this.states[c]!;
      const ready = st.status === 'idle' || (st.status === 'error' && now >= st.retryAt);
      if (ready && (c === this.wantFrom || this.states[c - 1]!.status === 'done')) void this.run(c);
    }
  }

  buildRequest(c: number, reqId = ''): TranslateRequest {
    const chunk = this.chunks[c]!;
    const { tokens, sentences } = this.transcript;
    const words = tokens.slice(chunk.tokStart, chunk.tokEnd).map((t) => t.text);

    const prev = c > 0 ? (this.results[c - 1] ?? heuristicLines(this.transcript, this.chunks[c - 1]!.sentStart, chunk.sentStart)) : [];
    return {
      type: 'translate',
      reqId,
      track: trackKey(this.info),
      chunkKey: fingerprint(words.join(' ')),
      videoId: this.info.videoId ?? '',
      title: this.title(),
      sourceLang: this.info.tlang ?? this.info.lang ?? 'auto',
      targetLang: this.targetLang,
      asr: this.info.kind === 'asr',
      words,
      contextBefore: prev
        .slice(-CONTEXT_LINES)
        .map((l) => (l.translation ? { source: l.source, translation: l.translation } : { source: l.source })),
      contextAfter: sentences.slice(chunk.sentEnd, chunk.sentEnd + CONTEXT_LINES).map((s) => s.text),
      glossary: [...this.glossary.values()].slice(-GLOSSARY_MAX),
      storySoFar: this.summaries
        .slice(0, c)
        .filter((s): s is string => !!s)
        .slice(-STORY_CHUNKS)
        .join(' '),
    };
  }

  private async run(c: number): Promise<void> {
    this.states[c] = { status: 'pending' };
    this.inFlight++;
    const reqId = `${Date.now().toString(36)}-${++reqSeq}`;
    partialHandlers.set(reqId, (subs) => {
      if (this.states[c]?.status !== 'pending') return;
      this.partials[c] = this.toLines(c, subs, true);
      this.flat = null;
      this.onUpdate();
    });
    let res: TranslateResponse;
    try {
      res = await sendToBackground<TranslateResponse>(this.buildRequest(c, reqId));
    } catch (err) {
      res = { ok: false, error: 'other', message: String(err) };
    }
    partialHandlers.delete(reqId);
    this.inFlight--;

    if (res.ok) {
      this.apply(c, res.result);
      this.costUsd += res.costUsd;
      this.states[c] = { status: 'done' };
    } else if (FATAL.has(res.error)) {
      this.fatal = { kind: res.error, message: res.message };
      this.states[c] = { status: 'idle' };
    } else {
      console.warn('[yt-bilingual] đoạn', c, 'lỗi, thử lại sau', RETRY_MS / 1000, 's:', res.message);
      this.states[c] = { status: 'error', retryAt: Date.now() + RETRY_MS, message: res.message };
    }
    this.onUpdate();
    this.pump();
  }

  /**
   * Dòng hiển thị của đoạn c từ các phụ đề Claude trả. Với kết quả dở
   * (`partial`), phần từ chưa được phủ vẫn hiện bằng câu heuristic.
   */
  private toLines(c: number, subs: readonly SubtitleOut[], partial: boolean): DisplayLine[] {
    const chunk = this.chunks[c]!;
    const { tokens, sentences } = this.transcript;
    const own = sentences.slice(chunk.sentStart, chunk.sentEnd);
    const lines: DisplayLine[] = subs.map((s) => ({
      startMs: tokens[chunk.tokStart + s.first]!.startMs,
      endMs: tokens[chunk.tokStart + s.last]!.endMs,
      source: s.source,
      translation: s.text || null,
    }));
    if (partial) {
      const covered = chunk.tokStart + (subs.at(-1)?.last ?? -1) + 1; // token đầu tiên chưa có phụ đề
      for (const s of own) {
        if (s.tokEnd <= covered) continue;
        const from = Math.max(s.tokStart, covered);
        const text = tokensToText(tokens.slice(from, s.tokEnd)).trim();
        if (text) lines.push({ startMs: tokens[from]!.startMs, endMs: s.endMs, source: text, translation: null });
      }
    }
    return lines;
  }

  private apply(c: number, r: ChunkResult): void {
    this.results[c] = this.toLines(c, r.subtitles, false);
    this.partials[c] = null;
    for (const g of r.glossary) {
      const k = g.term.toLowerCase();
      this.glossary.delete(k); // đưa mục mới cập nhật xuống cuối
      this.glossary.set(k, g);
    }
    this.summaries[c] = r.summary || null;
    this.flat = null;
  }
}
