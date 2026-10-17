import { describe, expect, it } from 'vitest';
import { staleKeys, summarize, type Entry } from '@/src/translate/cache';

const DAY = 24 * 60 * 60 * 1000;
const entry = (key: string, updatedAt: number, usedAt?: number): Entry<unknown> => ({ key, items: { a: { x: 'xin chào' } }, updatedAt, usedAt });

describe('summarize', () => {
  it('tách bản dịch / tra từ, đếm video không trùng', () => {
    const s = summarize([
      entry('vid1|en|asr||vi|claude-sonnet-5-5|p3', 0),
      entry('vid1|en|asr||vi|claude-opus-5-5|p3', 0),
      entry('vid2|en|manual||vi|claude-sonnet-5-5|p3', 0),
      entry('lookup|vi|claude-sonnet-5-5|v2|abc', 0),
    ]);
    expect(s.translations).toMatchObject({ entries: 3, videos: 2 });
    expect(s.lookups.entries).toBe(1);
    expect(s.translations.bytes).toBeGreaterThan(s.lookups.bytes * 2);
  });

  it('đếm byte UTF-8 (tiếng Việt nhiều byte hơn số ký tự)', () => {
    const e = entry('lookup|x', 0);
    expect(summarize([e]).lookups.bytes).toBe(new TextEncoder().encode(JSON.stringify(e)).length);
    expect(summarize([e]).lookups.bytes).toBeGreaterThan(JSON.stringify(e).length);
  });
});

describe('staleKeys', () => {
  const now = 1000 * DAY;
  it('theo lần dùng cuối, bản ghi cũ không có usedAt thì dùng updatedAt', () => {
    const keys = staleKeys(
      [
        entry('old', now - 100 * DAY),
        entry('oldButUsed', now - 100 * DAY, now - 2 * DAY),
        entry('fresh', now - 5 * DAY),
      ],
      now - 90 * DAY,
    );
    expect(keys).toEqual(['old']);
  });
});
