import { describe, expect, it } from 'vitest';
import { findActive, HOLD_MS } from '@/src/overlay/active';
import type { Sentence } from '@/src/transcript';

const s = (id: number, startMs: number, endMs: number): Sentence => ({ id, text: `s${id}`, startMs, endMs, tokStart: id, tokEnd: id + 1 });
const list = [s(0, 1000, 3000), s(1, 3000, 5000), s(2, 10_000, 12_000)];

describe('findActive', () => {
  it.each([
    [0, -1],
    [999, -1],
    [1000, 0],
    [2999, 0],
    [3000, 1],
    [5000 + HOLD_MS - 1, 1],
    [5000 + HOLD_MS, -1],
    [9999, -1],
    [11_000, 2],
    [99_999, -1],
  ])('t=%i → %i', (t, want) => expect(findActive(list, t)).toBe(want));

  it('không giữ câu đè lên câu kế', () => {
    expect(findActive([s(0, 0, 1000), s(1, 1200, 2000)], 1200)).toBe(1);
  });

  it('danh sách rỗng', () => expect(findActive([], 100)).toBe(-1));
});
