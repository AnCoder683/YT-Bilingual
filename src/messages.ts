// Message giữa content script / popup và service worker.

/** Mục glossary tích lũy qua các đoạn: tên riêng, nhân vật, thuật ngữ. */
export interface GlossaryEntry {
  term: string;
  translation: string;
  /** Ví dụ: "nữ, chị của người kể; xưng chị–em". */
  note: string;
}

export interface ContextLine {
  source: string;
  translation?: string;
}

export interface TranslateRequest {
  type: 'translate';
  /** Định danh request, để service worker gửi phụ đề dần (PartialMessage) về đúng chỗ. */
  reqId: string;
  /** Khóa cache của track (videoId|lang|kind|tlang). */
  track: string;
  /** Khóa của đoạn trong track (băm nội dung). */
  chunkKey: string;
  videoId: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  asr: boolean;
  /** Các từ của đoạn theo thứ tự (Claude tự chia thành phụ đề). */
  words: string[];
  contextBefore: ContextLine[];
  contextAfter: string[];
  glossary: GlossaryEntry[];
  storySoFar: string;
}

/**
 * Một phụ đề kết quả, chỉ số tính trong đoạn (inclusive):
 * gồm các từ `first..last` của đoạn.
 */
export interface SubtitleOut {
  first: number;
  last: number;
  /** Bản gốc (ASR thì đã thêm dấu câu). */
  source: string;
  text: string;
}

export interface ChunkResult {
  subtitles: SubtitleOut[];
  glossary: GlossaryEntry[];
  summary: string;
}

/** Service worker → content script: các phụ đề đã xong khi đang stream. */
export interface PartialMessage {
  type: 'partial';
  reqId: string;
  subtitles: SubtitleOut[];
}

export type TranslateResponse =
  | { ok: true; result: ChunkResult; costUsd: number; cached: boolean }
  | { ok: false; error: ErrorKind; message: string };

/** Tra một từ / cụm từ trong câu phụ đề. */
export interface LookupRequest {
  type: 'lookup';
  /** Chữ người dùng chọn, đúng như trong câu. */
  picked: string;
  sentence: string;
  /** Bản dịch của câu (nếu có), giúp Claude hiểu đúng ý. */
  translation: string;
  title: string;
  sourceLang: string;
  /** Ngôn ngữ giải nghĩa. */
  targetLang: string;
  videoId: string;
}

export interface LookupResult {
  /** Dạng gốc trong từ điển ("burned out" → "burn out"). */
  term: string;
  ipa: string;
  /** Loại từ (tiếng Anh, ngắn): noun, verb, phrasal verb, idiom… */
  pos: string;
  /** Nghĩa trong câu này, bằng ngôn ngữ đích. */
  meaning: string;
  /** Định nghĩa ngắn bằng tiếng Anh. */
  definition: string;
  /** Ghi chú cách dùng (ngôn ngữ đích), có thể rỗng. */
  note: string;
}

export type LookupResponse =
  | { ok: true; result: LookupResult; costUsd: number; cached: boolean }
  | { ok: false; error: ErrorKind; message: string };

export type ErrorKind = 'no_key' | 'auth' | 'credit' | 'budget' | 'rate_limit' | 'refusal' | 'network' | 'bad_output' | 'other';

export interface TestKeyRequest {
  type: 'test_key';
}

export type TestKeyResponse = { ok: true } | { ok: false; error: ErrorKind; message: string };

export type BackgroundRequest = TranslateRequest | TestKeyRequest | LookupRequest;

export async function sendToBackground<R>(msg: BackgroundRequest): Promise<R> {
  return (await browser.runtime.sendMessage(msg)) as R;
}
