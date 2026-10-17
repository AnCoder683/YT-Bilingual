import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSentences } from '@/src/transcript';
import { joinText, tokenize, tokensToText } from '@/src/transcript/join';
import { parseJson3 } from '@/src/transcript/parse';
import type { Json3, Piece } from '@/src/transcript/types';

const fixture = (name: string): Json3 => JSON.parse(readFileSync(`fixtures/${name}`, 'utf8'));
const p = (text: string, startMs: number, endMs = startMs + 300): Piece => ({ text, startMs, endMs });

describe('joinText (W1: không dính chữ)', () => {
  it.each([
    ['còn', 'hai', 'còn hai'],
    ['tới', 'khi', 'tới khi'],
    ['Ngân', 'đứng', 'Ngân đứng'],
    ['rất', 'nhiều', 'rất nhiều'],
    ['hello', ' world', 'hello world'],
    ['hello ', 'world', 'hello world'],
    ['xong', '.', 'xong.'],
    ['vâng', ', ạ', 'vâng, ạ'],
  ])('%j + %j = %j', (a, b, want) => expect(joinText(a, b, 'vi')).toBe(want));

  it('không chèn dấu cách cho tiếng Nhật', () => expect(joinText('今日は', '晴れ', 'ja')).toBe('今日は晴れ'));
});

describe('tokenize', () => {
  it('nối mảnh ASR giữa các event không dính chữ', () => {
    const toks = tokenize([p('nhắc', 0), p(' còn', 300), p('hai', 600), p(' phone', 900)], 'vi');
    expect(tokensToText(toks)).toBe('nhắc còn hai phone');
  });

  it('giữ [âm nhạc] là một token', () => {
    const toks = tokenize([p('[âm nhạc]', 0, 2000)], 'vi');
    expect(toks.map((t) => t.text)).toEqual(['[âm nhạc]']);
  });

  it('chia thời gian theo tỉ lệ ký tự trong một mảnh', () => {
    const toks = tokenize([p('aaaa bbbb', 0, 1000)], 'en');
    expect(toks[0]).toMatchObject({ startMs: 0, endMs: 556 });
    expect(toks[1]).toMatchObject({ startMs: 556, endMs: 1000 });
  });
});

describe('parseJson3', () => {
  it('dùng tOffsetMs và bỏ event chỉ có xuống dòng', () => {
    const pieces = parseJson3({
      events: [
        { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'xin' }, { utf8: ' chào', tOffsetMs: 500 }] },
        { tStartMs: 2900, dDurationMs: 100, aAppend: 1, segs: [{ utf8: '\n' }] },
        { tStartMs: 3000 },
      ],
    });
    expect(pieces).toEqual([
      { text: 'xin', startMs: 1000, endMs: 1500 },
      { text: ' chào', startMs: 1500, endMs: 3000 },
    ]);
  });
});

describe('segment', () => {
  it('ASR không dấu câu: cắt theo khoảng lặng', () => {
    const json: Json3 = {
      events: [
        { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: 'hôm' }, { utf8: ' nay', tOffsetMs: 300 }, { utf8: ' trời', tOffsetMs: 600 }, { utf8: ' đẹp', tOffsetMs: 900 }] },
        { tStartMs: 2500, dDurationMs: 900, segs: [{ utf8: 'mình' }, { utf8: ' đi', tOffsetMs: 300 }, { utf8: ' chơi', tOffsetMs: 600 }] },
      ],
    };
    expect(buildSentences(json, 'vi').map((s) => s.text)).toEqual(['hôm nay trời đẹp', 'mình đi chơi']);
  });

  it('ASR dài liên tục không có khoảng lặng: không câu nào vượt giới hạn', () => {
    const segs = Array.from({ length: 80 }, (_, i) => ({ utf8: (i ? ' ' : '') + 'từ' + i, tOffsetMs: i * 250 }));
    const out = buildSentences({ events: [{ tStartMs: 0, dDurationMs: 20_000, segs }] }, 'vi');
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) expect(s.endMs - s.startMs).toBeLessThanOrEqual(12_000);
    expect(out.map((s) => s.text).join(' ')).toBe(segs.map((s) => s.utf8.trim()).join(' '));
  });
});

describe('fixture pXBwcZh2Q8E (en, phụ đề người làm)', () => {
  const json = fixture('pXBwcZh2Q8E.en.manual.json3.json');
  const sentences = buildSentences(json, 'en');
  const fullText = tokensToText(tokenize(parseJson3(json), 'en'));

  it('không mất hay thêm chữ', () => {
    expect(sentences.map((s) => s.text).join(' ')).toBe(fullText);
  });

  it('câu nối qua nhiều event được ghép lại', () => {
    expect(sentences.map((s) => s.text)).toContain(
      'Then someone in the Cyberflow Discord drops a message saying "why aren\'t you using BlackArch" and I made the mistake of looking it up.',
    );
  });

  it('hầu hết câu bắt đầu ở đầu câu thật (không cắt giữa câu)', () => {
    const bad = sentences.filter((s) => /^[a-z]/.test(s.text));
    // Chỉ xảy ra khi câu gốc quá dài (>180 ký tự) hoặc gốc thiếu dấu câu.
    expect(bad.length / sentences.length).toBeLessThan(0.15);
  });

  it('mốc thời gian tăng dần và câu không quá dài', () => {
    for (let i = 1; i < sentences.length; i++) expect(sentences[i]!.startMs).toBeGreaterThanOrEqual(sentences[i - 1]!.startMs);
    for (const s of sentences) expect(s.text.length).toBeLessThanOrEqual(200);
  });
});

describe('fixture AdygBbbEnco (en, ASR theo từ)', () => {
  const json = fixture('AdygBbbEnco.en.asr.json3.json');
  const sentences = buildSentences(json, 'en');
  const words = (json.events ?? []).flatMap((e) => (e.segs ?? []).map((s) => s.utf8?.trim() ?? '')).filter(Boolean);

  it('không dính chữ: ghép lại đúng bằng các từ ASR cách nhau 1 dấu cách', () => {
    expect(sentences.map((s) => s.text).join(' ')).toBe(words.join(' '));
  });

  it('mốc thời gian theo từ: không câu nào vượt giới hạn, không chồng nhau', () => {
    for (const s of sentences) {
      expect(s.text.length).toBeLessThanOrEqual(120);
      expect(s.endMs - s.startMs).toBeLessThanOrEqual(12_000);
    }
    for (let i = 1; i < sentences.length; i++) expect(sentences[i]!.startMs).toBeGreaterThanOrEqual(sentences[i - 1]!.endMs);
  });

  it('câu đầu bắt đầu đúng mốc từ đầu tiên', () => {
    expect(sentences[0]).toMatchObject({ startMs: 160 });
    expect(sentences[0]!.text.startsWith('Mac windows or Linux')).toBe(true);
  });
});
