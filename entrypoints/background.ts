import type {
  BackgroundRequest,
  ChunkResult,
  LookupRequest,
  LookupResponse,
  LookupResult,
  PartialMessage,
  SubtitleOut,
  TestKeyResponse,
  TranslateRequest,
  TranslateResponse,
} from '@/src/messages';
import { API_KEY_STORAGE, loadSettings } from '@/src/settings';
import { cacheGet, cacheKey, cachePut } from '@/src/translate/cache';
import { fingerprint } from '@/src/translate/chunks';
import { lookupTerm, testKey, TranslateError, translateChunk } from '@/src/translate/claude';
import { LOOKUP_VERSION } from '@/src/translate/lookup';
import { PROMPT_VERSION, type PromptInput } from '@/src/translate/prompt';
import { addUsage, budgetError, loadUsage } from '@/src/translate/usage';

const MAX_CONCURRENT = 3;
let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function getApiKey(): Promise<string | null> {
  const key = (await browser.storage.local.get(API_KEY_STORAGE))[API_KEY_STORAGE];
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

async function handleTranslate(req: TranslateRequest, tab?: { tabId: number; frameId: number }): Promise<TranslateResponse> {
  const { model, monthlyBudgetUsd } = await loadSettings();
  const key = cacheKey(req.track, req.targetLang, model, PROMPT_VERSION);
  const hit = (await cacheGet(key))[req.chunkKey];
  if (hit) return { ok: true, result: hit, costUsd: 0, cached: true };

  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: 'no_key', message: 'Chưa có API key — mở popup YT Bilingual để nhập.' };
  // Bản dịch trong cache vẫn xem được; chỉ chặn request mới. Các request đang
  // chạy dở vẫn hoàn tất nên có thể vượt ngân sách một chút.
  const over = budgetError((await loadUsage()).monthUsd, monthlyBudgetUsd);
  if (over) return { ok: false, error: 'budget', message: over };

  const base = {
    title: req.title,
    sourceLang: req.sourceLang,
    targetLang: req.targetLang,
    asr: req.asr,
    contextBefore: req.contextBefore,
    contextAfter: req.contextAfter,
    glossary: req.glossary,
    storySoFar: req.storySoFar,
  };
  // Gửi dần phụ đề đã xong về tab đang xem (chỉ cho lần gọi đầu).
  const onPartial = tab
    ? (subtitles: SubtitleOut[]) => {
        const msg: PartialMessage = { type: 'partial', reqId: req.reqId, subtitles };
        browser.tabs.sendMessage(tab.tabId, msg, { frameId: tab.frameId }).catch(() => {});
      }
    : undefined;

  let cost = 0;
  const call = async (input: PromptInput, partial?: typeof onPartial) => {
    try {
      const res = await withSlot(() => translateChunk(apiKey, model, input, partial));
      cost += res.costUsd;
      return res.result;
    } catch (err) {
      if (err instanceof TranslateError) cost += err.costUsd;
      throw err;
    }
  };

  let result: ChunkResult;
  try {
    const input = { ...base, words: req.words };
    // JSON hỏng / bị cắt: thử lại một lần.
    result = await call(input, onPartial).catch((err) => {
      if (err instanceof TranslateError && err.kind === 'bad_output') return call(input);
      throw err;
    });
  } catch (err) {
    if (cost) await addUsage(req.videoId, cost);
    const e = err instanceof TranslateError ? err : new TranslateError('other', String(err));
    console.warn('[yt-bilingual] dịch lỗi', e.kind, e.message);
    return { ok: false, error: e.kind, message: e.message };
  }
  await cachePut(key, { [req.chunkKey]: result });
  await addUsage(req.videoId, cost);
  console.log(
    `[yt-bilingual] dịch đoạn ${req.words.length} từ → ${result.subtitles.length} phụ đề, $${cost.toFixed(5)}, model ${model}`,
  );
  return { ok: true, result, costUsd: cost, cached: false };
}

/** Tra từ: cache theo (chữ chọn, câu), mỗi mục một bản ghi. */
async function handleLookup(req: LookupRequest): Promise<LookupResponse> {
  const { model, monthlyBudgetUsd } = await loadSettings();
  const key = ['lookup', req.targetLang, model, `v${LOOKUP_VERSION}`, fingerprint(`${req.picked.toLowerCase()}\u0000${req.sentence}`)].join('|');
  const hit = (await cacheGet<LookupResult>(key)).r;
  if (hit) return { ok: true, result: hit, costUsd: 0, cached: true };

  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: 'no_key', message: 'Chưa có API key — mở popup YT Bilingual để nhập.' };
  const over = budgetError((await loadUsage()).monthUsd, monthlyBudgetUsd);
  if (over) return { ok: false, error: 'budget', message: over };

  try {
    const { result, costUsd } = await withSlot(() => lookupTerm(apiKey, model, req));
    await cachePut<LookupResult>(key, { r: result });
    await addUsage(req.videoId, costUsd);
    return { ok: true, result, costUsd, cached: false };
  } catch (err) {
    const e = err instanceof TranslateError ? err : new TranslateError('other', String(err));
    if (e.costUsd) await addUsage(req.videoId, e.costUsd);
    return { ok: false, error: e.kind, message: e.message };
  }
}

async function handleTestKey(): Promise<TestKeyResponse> {
  const apiKey = await getApiKey();
  if (!apiKey) return { ok: false, error: 'no_key', message: 'Chưa nhập API key.' };
  try {
    await testKey(apiKey);
    return { ok: true };
  } catch (err) {
    const e = err as TranslateError;
    return { ok: false, error: e.kind, message: e.message };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: BackgroundRequest, sender, sendResponse) => {
    const tab = sender.tab?.id !== undefined ? { tabId: sender.tab.id, frameId: sender.frameId ?? 0 } : undefined;
    const job =
      msg.type === 'translate'
        ? handleTranslate(msg, tab)
        : msg.type === 'lookup'
          ? handleLookup(msg)
          : msg.type === 'test_key'
            ? handleTestKey()
            : null;
    if (!job) return false;
    job.then(sendResponse, (err) => sendResponse({ ok: false, error: 'other', message: String(err) }));
    return true; // giữ kênh mở cho sendResponse bất đồng bộ
  });
});
