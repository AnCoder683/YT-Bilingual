import Anthropic from '@anthropic-ai/sdk';
import type { ChunkResult, ErrorKind, LookupResult, SubtitleOut } from '../messages';
import { modelInfo } from '../settings';
import { costUsd } from './cost';
import { buildLookupMessage, LOOKUP_SCHEMA, LOOKUP_SYSTEM, parseLookup, type LookupInput } from './lookup';
import {
  buildUserMessage,
  parsePartial,
  parseWordsResult,
  SYSTEM_PROMPT,
  WORDS_SCHEMA,
  type PromptInput,
} from './prompt';

export class TranslateError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    /** Tiền đã tốn cho request hỏng (refusal, JSON lỗi…). */
    readonly costUsd = 0,
  ) {
    super(message);
  }
}

export interface BatchResult {
  result: ChunkResult;
  costUsd: number;
}

let client: Anthropic | null = null;
let clientKey = '';

function getClient(apiKey: string): Anthropic {
  if (!client || clientKey !== apiKey) {
    // Chạy trong service worker của extension: key do người dùng nhập, chỉ
    // nằm ở chrome.storage.local và không bao giờ đi vào trang web.
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 3 });
    clientKey = apiKey;
  }
  return client;
}

/**
 * Gọi Claude dịch một đoạn (streaming); lỗi được quy về TranslateError.
 * `onPartial` nhận các phụ đề đã xong mỗi khi có thêm, để hiện dần.
 */
export async function translateChunk(
  apiKey: string,
  model: string,
  input: PromptInput,
  onPartial?: (subtitles: SubtitleOut[]) => void,
): Promise<BatchResult> {
  const c = getClient(apiKey);
  const info = modelInfo(model);
  try {
    const stream = c.beta.messages.stream({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: WORDS_SCHEMA } },
      messages: [{ role: 'user', content: buildUserMessage(input) }],
      ...(info.fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (onPartial) {
      let sent = 0;
      stream.on('text', (_delta, snapshot) => {
        const subs = parsePartial(snapshot, input.words.length);
        if (subs.length > sent) {
          sent = subs.length;
          onPartial(subs);
        }
      });
    }
    const res = await stream.finalMessage();

    const cost = costUsd(model, res.usage);
    if (res.stop_reason === 'refusal') {
      throw new TranslateError('refusal', `Claude từ chối dịch đoạn này (${res.stop_details?.category ?? 'không rõ'}).`, cost);
    }
    if (res.stop_reason === 'max_tokens') {
      throw new TranslateError('bad_output', 'Câu trả lời bị cắt (max_tokens).', cost);
    }
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let result: ChunkResult;
    try {
      result = parseWordsResult(text, input.words.length);
    } catch {
      throw new TranslateError('bad_output', 'Claude trả về JSON không hợp lệ.', cost);
    }
    return { result, costUsd: cost };
  } catch (err) {
    throw toTranslateError(err);
  }
}

/** Tra một từ / cụm từ trong câu (ngắn, không stream). */
export async function lookupTerm(apiKey: string, model: string, input: LookupInput): Promise<{ result: LookupResult; costUsd: number }> {
  try {
    const res = await getClient(apiKey).messages.create({
      model,
      max_tokens: 2000,
      system: LOOKUP_SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: LOOKUP_SCHEMA } },
      messages: [{ role: 'user', content: buildLookupMessage(input) }],
    });
    const cost = costUsd(model, res.usage);
    if (res.stop_reason === 'refusal') throw new TranslateError('refusal', 'Claude từ chối tra từ này.', cost);
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    try {
      return { result: parseLookup(text, input.picked, input.sourceLang), costUsd: cost };
    } catch {
      throw new TranslateError('bad_output', 'Claude trả về kết quả tra từ không hợp lệ.', cost);
    }
  } catch (err) {
    throw toTranslateError(err);
  }
}

/** Kiểm tra key bằng Models API (miễn phí, không tốn token). */
export async function testKey(apiKey: string): Promise<void> {
  try {
    await getClient(apiKey).models.retrieve('claude-sonnet-5-5');
  } catch (err) {
    throw toTranslateError(err);
  }
}

function toTranslateError(err: unknown): TranslateError {
  if (err instanceof TranslateError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new TranslateError('auth', 'API key sai, đã bị xóa hoặc đã hết hạn.');
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new TranslateError('auth', `Key không có quyền: ${err.message}`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new TranslateError('rate_limit', 'Gọi API quá nhanh, thử lại sau ít phút.');
  }
  if (err instanceof Anthropic.BadRequestError) {
    // Hết tiền là 400 invalid_request_error; thông báo của API đã nói rõ lý do.
    const kind: ErrorKind = /credit balance/i.test(err.message) ? 'credit' : 'other';
    return new TranslateError(kind, kind === 'credit' ? 'Hết credit Claude, hãy nạp thêm trên platform.claude.com.' : err.message);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new TranslateError('network', 'Không kết nối được tới api.anthropic.com.');
  }
  if (err instanceof Anthropic.APIError) {
    return new TranslateError('other', `Lỗi API ${err.status ?? ''}: ${err.message}`);
  }
  return new TranslateError('other', String(err));
}
