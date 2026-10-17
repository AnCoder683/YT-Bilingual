import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { joinParts, splitWords } from '@/src/lookup/words';
import { buildLookupMessage, parseLookup } from '@/src/translate/lookup';
import { addVocab, hasVocab, loadVocab, removeVocab, type VocabEntry } from '@/src/vocab';

describe('splitWords', () => {
  it('tách từ, giữ dấu câu và khoảng trắng, "don\'t" là một từ', () => {
    const parts = splitWords("I don't know, really.", 'en');
    expect(parts.filter((p) => p.word).map((p) => p.text)).toEqual(['I', "don't", 'know', 'really']);
    expect(parts.map((p) => p.text).join('')).toBe("I don't know, really.");
    expect(parts.find((p) => p.text.includes(','))).toEqual({ text: ', ', word: false });
  });

  it('tiếng Nhật không có dấu cách vẫn tách được từ', () => {
    const words = splitWords('私は学生です', 'ja').filter((p) => p.word);
    expect(words.length).toBeGreaterThan(1);
  });

  it('joinParts lấy cả cụm theo cả hai chiều kéo, bỏ dấu câu hai đầu', () => {
    const parts = splitWords("I'm just burned out, really.", 'en');
    const i = parts.findIndex((p) => p.text === 'burned');
    const j = parts.findIndex((p) => p.text === 'out');
    expect(joinParts(parts, i, j)).toBe('burned out');
    expect(joinParts(parts, j, i)).toBe('burned out');
    expect(joinParts(parts, i, i)).toBe('burned');
  });

  it('chuỗi rỗng', () => expect(splitWords('', 'en')).toEqual([]));
});

describe('tra từ: prompt và kết quả', () => {
  it('message gồm chữ chọn, câu, bản dịch, ngôn ngữ', () => {
    const m = JSON.parse(
      buildLookupMessage({ picked: 'burned out', sentence: "I'm burned out.", translation: 'Tôi kiệt sức.', title: 'T', sourceLang: 'en', targetLang: 'vi' }),
    );
    expect(m).toMatchObject({ picked: 'burned out', sentence: "I'm burned out.", sentence_translation: 'Tôi kiệt sức.', target_lang: 'vi' });
  });

  it('parseLookup: thiếu term thì dùng chữ đã chọn; không có nghĩa thì lỗi', () => {
    const r = parseLookup(JSON.stringify({ term: '', ipa: '/x/', pos: 'verb', meaning: ' kiệt sức ', definition: 'tired', note: '' }), 'burned out');
    expect(r).toEqual({ term: 'burned out', ipa: '/x/', pos: 'verb', meaning: 'kiệt sức', definition: 'tired', note: '' });
    expect(() => parseLookup(JSON.stringify({ term: 'a', meaning: '', definition: '' }), 'a')).toThrow();
    expect(() => parseLookup('không phải JSON', 'a')).toThrow();
  });
});

const entry = (over: Partial<VocabEntry> = {}): Omit<VocabEntry, 'id' | 'addedAt'> => ({
  term: 'burn out',
  ipa: '/bɜːrn aʊt/',
  pos: 'phrasal verb',
  meaning: 'kiệt sức',
  definition: 'to become exhausted from too much work',
  note: '',
  picked: 'burned out',
  sentence: "I'm just burned out, really.",
  translation: 'Tôi thật sự kiệt sức.',
  videoId: 'abc',
  title: 'Video "hay" <1>',
  tMs: 83_500,
  ...over,
});

describe('sổ từ vựng', () => {
  beforeEach(() => fakeBrowser.reset());

  it('thêm vào đầu sổ, cùng từ cùng câu thì thay mục cũ, xóa được', async () => {
    await addVocab(entry());
    await addVocab(entry({ term: 'really', picked: 'really' }));
    await addVocab(entry({ meaning: 'mệt rã rời', term: 'Burn Out' }));
    const list = await loadVocab();
    expect(list.map((e) => e.meaning)).toEqual(['mệt rã rời', 'kiệt sức']);
    expect(await hasVocab('burn out', "I'm just burned out, really.")).toBe(true);
    expect(await hasVocab('burn out', 'câu khác')).toBe(false);
    await removeVocab(list[0]!.id);
    expect((await loadVocab()).map((e) => e.term)).toEqual(['really']);
  });
});
