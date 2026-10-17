import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { TranslateRequest } from '@/src/messages';
import { DEFAULT_SETTINGS, pickTarget } from '@/src/settings';
import { buildTranscript, type Sentence, type Token, type Transcript } from '@/src/transcript';
import { chunkAt, fingerprint, makeChunks, WORDS_MAX, WORDS_MIN } from '@/src/translate/chunks';
import { costUsd } from '@/src/translate/cost';
import { buildUserMessage, completeItems, parsePartial, parseWordsResult, SYSTEM_PROMPT } from '@/src/translate/prompt';

const fixture = (name: string) => JSON.parse(readFileSync(`fixtures/${name}`, 'utf8'));

/** Transcript ASR giả: `n` câu heuristic, mỗi câu 10 từ, mỗi từ 300 ms. */
function fakeAsr(n: number): Transcript {
  const tokens: Token[] = [];
  const sentences: Sentence[] = [];
  for (let i = 0; i < n; i++) {
    const tokStart = tokens.length;
    for (let w = 0; w < 10; w++) {
      const startMs = tokens.length * 300;
      tokens.push({ text: `w${tokens.length}`, startMs, endMs: startMs + 250, spaceBefore: true });
    }
    sentences.push({
      id: i,
      text: tokens.slice(tokStart).map((t) => t.text).join(' '),
      startMs: tokens[tokStart]!.startMs,
      endMs: tokens.at(-1)!.endMs,
      tokStart,
      tokEnd: tokens.length,
    });
  }
  return { tokens, sentences, punctuated: false };
}

describe('pickTarget', () => {
  it('video tiếng Anh → tiếng Việt', () => expect(pickTarget('en', DEFAULT_SETTINGS)).toBe('vi'));
  it('video tiếng Việt → ngôn ngữ phụ (en)', () => expect(pickTarget('vi', DEFAULT_SETTINGS)).toBe('en'));
  it('so theo ngôn ngữ gốc, bỏ vùng', () => expect(pickTarget('en-US', { ...DEFAULT_SETTINGS, targetLang: 'en', altTargetLang: 'vi' })).toBe('vi'));
  it('nguồn trùng cả hai → không dịch', () =>
    expect(pickTarget('en', { ...DEFAULT_SETTINGS, targetLang: 'en', altTargetLang: 'en-GB' })).toBeNull());
});

describe('parseWordsResult', () => {
  const sub = (last_word: unknown, source = 's', text = 't') => ({ last_word, source, text });
  it('phụ đề liên tiếp, phủ đủ từ', () => {
    const r = parseWordsResult(JSON.stringify({ subtitles: [sub(2, 'A b c.'), sub(4, 'D e?')], glossary: [], summary: '' }), 5);
    expect(r.subtitles).toEqual([
      { first: 0, last: 2, source: 'A b c.', text: 't' },
      { first: 3, last: 4, source: 'D e?', text: 't' },
    ]);
  });
  it('đọc glossary (bỏ mục rỗng) + summary', () => {
    const r = parseWordsResult(
      JSON.stringify({ subtitles: [sub(0)], glossary: [{ term: 'Ngân', translation: 'Ngân', note: 'nữ' }, { term: '', translation: 'x', note: '' }], summary: ' Hai người gặp nhau. ' }),
      1,
    );
    expect(r.glossary).toEqual([{ term: 'Ngân', translation: 'Ngân', note: 'nữ' }]);
    expect(r.summary).toBe('Hai người gặp nhau.');
  });
  it('JSON hỏng thì ném lỗi', () => expect(() => parseWordsResult('{', 1)).toThrow());
  it('bỏ chỉ số lùi / vượt phạm vi / không phải số nguyên; thiếu đuôi thì kéo dài phụ đề cuối', () => {
    const r = parseWordsResult(JSON.stringify({ subtitles: [sub(3), sub(2), sub(1.5), sub(99), sub(5)] }), 8);
    expect(r.subtitles.map((s) => [s.first, s.last])).toEqual([
      [0, 3],
      [4, 7],
    ]);
  });
  it('không có mục dùng được thì ném lỗi', () => expect(() => parseWordsResult(JSON.stringify({ subtitles: [sub(9)] }), 5)).toThrow());
});

describe('stream dở (completeItems / parsePartial)', () => {
  const full = JSON.stringify({
    subtitles: [
      { last_word: 1, source: 'Hi, "you" {x}.', text: 'Chào' },
      { last_word: 3, source: 'Ok \\ go]', text: 'Đi' },
    ],
    glossary: [],
    summary: '',
  });
  it('chỉ lấy object đã đóng, không bị lừa bởi ngoặc trong chuỗi', () => {
    const cut = full.indexOf('"last_word":3') + 5;
    expect(completeItems(full.slice(0, cut), 'subtitles')).toHaveLength(1);
    expect(completeItems(full, 'subtitles').map((o) => o.source)).toEqual(['Hi, "you" {x}.', 'Ok \\ go]']);
    expect(completeItems('{"subtit', 'subtitles')).toEqual([]);
  });
  it('mỗi tiền tố của câu trả lời đều cho kết quả hợp lệ, tăng dần', () => {
    let prev = 0;
    for (let i = 0; i <= full.length; i++) {
      const n = parsePartial(full.slice(0, i), 4).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBe(2);
  });
});

describe('prompt', () => {
  it('system prompt không chứa biến (để cache)', () => expect(SYSTEM_PROMPT).not.toMatch(/\$\{|undefined/));
  it('đánh số từ', () => {
    const msg = JSON.parse(
      buildUserMessage({ title: 'T', sourceLang: 'en', targetLang: 'vi', asr: true, words: ['so', 'today'], contextBefore: [{ source: 'a', translation: 'b' }], contextAfter: [], glossary: [], storySoFar: '' }),
    );
    expect(msg.words).toBe('[0]so [1]today');
    expect(msg.context_before).toEqual([{ source: 'a', translation: 'b' }]);
  });
});

describe('costUsd', () => {
  it('Sonnet 5.5: 1M vào + 1M ra = $12', () =>
    expect(costUsd('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 })).toBeCloseTo(12));
  it('Haiku 5.5 tính cả cache', () =>
    expect(
      costUsd('claude-haiku-5-5', { input_tokens: 1e6, output_tokens: 0, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 }),
    ).toBeCloseTo(0.1 + 0.125 + 0.01));
});

describe('makeChunks', () => {
  /** Các đoạn phải nối tiếp nhau và phủ hết câu. */
  const contiguous = (t: Transcript) => {
    const chunks = makeChunks(t);
    expect(chunks[0]!.sentStart).toBe(0);
    expect(chunks.at(-1)!.sentEnd).toBe(t.sentences.length);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.sentStart).toBe(chunks[i - 1]!.sentEnd);
    return chunks;
  };

  it('ASR thật (AdygBbbEnco): cỡ đoạn trong [MIN, MAX] từ', () => {
    const t = buildTranscript(fixture('AdygBbbEnco.en.asr.json3.json'), 'en');
    const chunks = contiguous(t);
    for (const c of chunks.slice(0, -1)) {
      const words = c.tokEnd - c.tokStart;
      expect(words).toBeGreaterThanOrEqual(WORDS_MIN);
      expect(words).toBeLessThanOrEqual(WORDS_MAX + 40);
    }
  });

  it('phụ đề người làm (pXBwcZh2Q8E): đoạn kết thúc ở dấu kết câu', () => {
    const t = buildTranscript(fixture('pXBwcZh2Q8E.en.manual.json3.json'), 'en');
    const chunks = contiguous(t);
    for (const c of chunks) expect(t.sentences[c.sentEnd - 1]!.text).toMatch(/[.?!…]["')\]]*$/);
  });

  it('transcript ngắn (trong [MIN, MAX]) là một đoạn', () => {
    expect(contiguous(fakeAsr(15)).map((c) => c.tokEnd - c.tokStart)).toEqual([150]);
    expect(contiguous(fakeAsr(3)).map((c) => c.tokEnd - c.tokStart)).toEqual([30]);
  });

  it('mẩu dư nhỏ gộp vào đoạn trước', () => {
    const t = fakeAsr(40); // 400 từ = 180 + 220 (vì sau 360 chỉ còn 40 < 60)
    expect(contiguous(t).map((c) => c.tokEnd - c.tokStart)).toEqual([WORDS_MAX, 400 - WORDS_MAX]);
  });

  it('phần dư vừa phải thành đoạn cuối, chunkAt tìm đúng đoạn', () => {
    const t = fakeAsr(44); // 440 từ = 180 + 180 + 80
    const chunks = contiguous(t);
    expect(chunks.map((c) => c.tokEnd - c.tokStart)).toEqual([WORDS_MAX, WORDS_MAX, 440 - 2 * WORDS_MAX]);
    expect(chunkAt(chunks, -5)).toBe(0);
    expect(chunkAt(chunks, chunks[1]!.startMs)).toBe(1);
    expect(chunkAt(chunks, 1e9)).toBe(2);
  });

  it('fingerprint ổn định, khác nội dung thì khác', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
  });
});

describe('Translator', () => {
  const info = { videoId: 'v', lang: 'en', kind: 'asr', tlang: null, fmt: 'json3' } as const;

  /** Giả Claude: mỗi 5 từ thành một phụ đề "S<từ đầu>" / "T<từ đầu>". */
  const fakeSend = (calls: TranslateRequest[]) =>
    vi.fn(async (req: TranslateRequest) => {
      calls.push(req);
      const n = req.words!.length;
      const subtitles = Array.from({ length: Math.ceil(n / 5) }, (_, i) => ({
        first: i * 5,
        last: Math.min(n, i * 5 + 5) - 1,
        source: `S${req.words![i * 5]}`,
        text: `T${req.words![i * 5]}`,
      }));
      return {
        ok: true,
        result: { subtitles, glossary: [{ term: `g${calls.length}`, translation: 'x', note: '' }], summary: `chunk ${calls.length}` },
        costUsd: 0.001,
        cached: false,
      };
    });

  it('dịch tuần tự đoạn hiện tại + lookahead, mang glossary/tóm tắt sang đoạn sau, tua thì nhảy tới', async () => {
    vi.resetModules();
    const calls: TranslateRequest[] = [];
    vi.doMock('@/src/messages', () => ({ sendToBackground: fakeSend(calls) }));
    const { Translator } = await import('@/src/scheduler');
    const t = fakeAsr(200); // 2000 từ → ~10 đoạn
    const tr = new Translator(info, t, 'vi', () => 'Title', () => {});
    const n = tr.chunks.length;
    expect(n).toBeGreaterThan(5);

    // Trước khi dịch: hiển thị câu heuristic.
    expect(tr.lines()[0]).toMatchObject({ source: t.sentences[0]!.text, translation: null });

    tr.ensureAround(0);
    expect(calls.length).toBe(1); // đoạn 1 đợi đoạn 0 xong
    await vi.waitFor(() => expect(calls.length).toBe(3));
    await vi.waitFor(() => expect(tr.costUsd).toBeCloseTo(0.003));
    expect(calls.map((c) => c.words![0])).toEqual(tr.chunks.slice(0, 3).map((c) => `w${c.tokStart}`));
    expect(calls[0]!.storySoFar).toBe('');
    expect(calls[1]!.storySoFar).toBe('chunk 1');
    expect(calls[2]!.glossary.map((g) => g.term)).toEqual(['g1', 'g2']);
    expect(calls[1]!.contextBefore.at(-1)).toMatchObject({ translation: expect.stringMatching(/^T/) });
    expect(calls[0]!.title).toBe('Title');

    // Sau khi dịch: dòng hiển thị là phụ đề Claude chia, thời gian theo từ.
    const first = tr.lines()[0]!;
    expect(first).toEqual({ startMs: 0, endMs: t.tokens[4]!.endMs, source: 'Sw0', translation: 'Tw0' });

    tr.ensureAround(tr.chunks.at(-1)!.startMs); // tua tới cuối
    await vi.waitFor(() => expect(calls.length).toBe(4));
    expect(calls[3]!.words![0]).toBe(`w${tr.chunks.at(-1)!.tokStart}`);
  });

  it('stream: phụ đề hiện dần, phần chưa dịch vẫn hiện câu gốc; statusAt', async () => {
    vi.resetModules();
    let resolve!: (v: unknown) => void;
    let lastReq!: TranslateRequest;
    vi.doMock('@/src/messages', () => ({
      sendToBackground: vi.fn((req: TranslateRequest) => {
        lastReq = req;
        return new Promise((r) => (resolve = r));
      }),
    }));
    const { Translator, handlePartial } = await import('@/src/scheduler');
    const t = fakeAsr(30);
    const tr = new Translator(info, t, 'vi', () => '', () => {});
    tr.ensureAround(0);
    expect(tr.statusAt(0)).toEqual({ kind: 'pending' });

    // Claude mới trả xong 1 phụ đề (từ 0..6): từ 7 trở đi vẫn là câu gốc.
    handlePartial({ type: 'partial', reqId: lastReq.reqId, subtitles: [{ first: 0, last: 6, source: 'A.', text: 'TA' }] });
    const lines = tr.lines();
    expect(lines[0]).toMatchObject({ source: 'A.', translation: 'TA' });
    expect(lines[1]).toMatchObject({ source: 'w7 w8 w9', translation: null, startMs: t.tokens[7]!.startMs });
    expect(lines[2]).toMatchObject({ source: t.sentences[1]!.text });
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.startMs).toBeGreaterThanOrEqual(lines[i - 1]!.startMs);

    handlePartial({ type: 'partial', reqId: 'khác', subtitles: [] }); // reqId lạ: bỏ qua
    resolve({ ok: false, error: 'network', message: 'mất mạng' });
    await vi.waitFor(() => expect(tr.statusAt(0)).toEqual({ kind: 'error', message: 'mất mạng' }));
  });

  it('lỗi thiếu key thì dừng, không gọi tiếp', async () => {
    vi.resetModules();
    const send = vi.fn(async () => ({ ok: false, error: 'no_key', message: 'Chưa có API key' }));
    vi.doMock('@/src/messages', () => ({ sendToBackground: send }));
    const { Translator } = await import('@/src/scheduler');
    const t = fakeAsr(100);
    const tr = new Translator(info, t, 'vi', () => '', () => {});
    tr.ensureAround(0);
    await vi.waitFor(() => expect(tr.fatal?.kind).toBe('no_key'));
    const n = send.mock.calls.length;
    tr.ensureAround(tr.chunks.at(-1)!.startMs);
    expect(send.mock.calls.length).toBe(n);
  });

  it('chạm ngân sách: đoạn đó không thử lại, đoạn sau vẫn hỏi (có thể có trong cache)', async () => {
    vi.resetModules();
    const calls: TranslateRequest[] = [];
    const ok = fakeSend([]);
    const send = vi.fn(async (req: TranslateRequest) => {
      calls.push(req);
      return calls.length === 1 ? { ok: false, error: 'budget', message: 'Hết ngân sách' } : ok(req);
    });
    vi.doMock('@/src/messages', () => ({ sendToBackground: send }));
    const { Translator } = await import('@/src/scheduler');
    const tr = new Translator(info, fakeAsr(100), 'vi', () => '', () => {});
    tr.ensureAround(0);
    await vi.waitFor(() => expect(calls.length).toBe(3));
    expect(tr.fatal).toBeNull();
    expect(tr.statusAt(0)).toEqual({ kind: 'blocked', message: 'Hết ngân sách' });
    expect(tr.statusAt(tr.chunks[1]!.startMs)).toBeNull();
    tr.ensureAround(0);
    expect(calls.length).toBe(3);
  });
});
