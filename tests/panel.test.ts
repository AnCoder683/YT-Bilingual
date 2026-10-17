import { describe, expect, it } from 'vitest';
import { pickPlace } from '@/src/panel/place';
import { foldQuery, matches, splitMatches } from '@/src/panel/search';

describe('pickPlace', () => {
  it.each([
    [{ fullscreen: true, twoColumns: true, theater: false }, 'overlay'],
    [{ fullscreen: true, twoColumns: false, theater: false }, 'overlay'],
    [{ fullscreen: false, twoColumns: true, theater: false }, 'side'],
    [{ fullscreen: false, twoColumns: true, theater: true }, 'theater'],
    [{ fullscreen: false, twoColumns: false, theater: true }, 'below'],
    [{ fullscreen: false, twoColumns: false, theater: false }, 'below'],
  ] as const)('%o → %s', (flags, want) => expect(pickPlace(flags)).toBe(want));
});

describe('tìm kiếm', () => {
  it('bỏ dấu, không phân biệt hoa thường, cả chữ đ', () => {
    const q = foldQuery('van hoa');
    expect(matches('Hãy bắt đầu với Văn Hóa làm việc.', q)).toBe(true);
    expect(matches('Đi đâu đó', foldQuery('di dau'))).toBe(true);
    expect(matches('Đi đâu đó', foldQuery('đâu'))).toBe(true);
    expect(matches('abc', foldQuery('x'))).toBe(false);
    expect(matches('abc', '')).toBe(false);
  });

  it('đánh dấu đúng đoạn gốc (giữ dấu), nhiều chỗ khớp', () => {
    expect(splitMatches('Văn hóa và văn học', foldQuery('van'))).toEqual([
      { text: 'Văn', hit: true },
      { text: ' hóa và ', hit: false },
      { text: 'văn', hit: true },
      { text: ' học', hit: false },
    ]);
  });

  it('dấu viết dạng tổ hợp (NFD) vẫn khớp và cắt đúng', () => {
    const nfd = 'Văn hóa'.normalize('NFD');
    const parts = splitMatches(nfd, foldQuery('hoa'));
    expect(parts.map((p) => p.hit)).toEqual([false, true]);
    expect(parts.map((p) => p.text).join('')).toBe(nfd);
    expect(parts[1]!.text.normalize('NFC')).toBe('hóa');
  });

  it('không có truy vấn thì nguyên văn', () => {
    expect(splitMatches('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });
});
