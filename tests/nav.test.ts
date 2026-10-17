import { describe, expect, it } from 'vitest';
import { AutoPause, LEAD_MS, navTarget, PAUSE_EARLY_MS, PAUSED_LOOKAHEAD_MS } from '@/src/nav';
import { findActive } from '@/src/overlay/active';
import { HOLD_MS } from '@/src/overlay/active';
import { budgetError } from '@/src/translate/usage';

const l = (startMs: number, endMs: number) => ({ startMs, endMs });
// Câu 0 và 1 nối liền; câu 2 sau một khoảng lặng.
const lines = [l(1000, 3000), l(3000, 5000), l(10_000, 12_000)];
const at = (i: number) => lines[i]!.startMs - LEAD_MS;

describe('navTarget', () => {
  it.each([
    // [thời điểm, hướng, câu đích]
    [4000, 'prev', 0],
    [2000, 'prev', 0], // câu đầu: không lùi được nữa
    [500, 'prev', 0],
    [7000, 'prev', 1], // khoảng lặng sau câu 1: nghe lại câu 1
    [5000 + HOLD_MS - 1, 'prev', 0], // vẫn đang hiện câu 1
    [11_000, 'prev', 1],
    [4000, 'repeat', 1],
    [7000, 'repeat', 1],
    [500, 'repeat', 0],
    [500, 'next', 0],
    [2000, 'next', 1],
    [7000, 'next', 2],
  ] as const)('t=%i %s → câu %i', (t, dir, want) => expect(navTarget(lines, t, dir)).toBe(at(want)));

  it('hết câu hoặc danh sách rỗng thì null', () => {
    expect(navTarget(lines, 11_000, 'next')).toBeNull();
    expect(navTarget([], 0, 'prev')).toBeNull();
  });

  it('vừa tua tới đầu câu (lệch LEAD_MS) thì bấm tiếp vẫn đi tiếp', () => {
    expect(navTarget(lines, at(1), 'next')).toBe(at(2));
    expect(navTarget(lines, at(1), 'prev')).toBe(at(0));
    expect(navTarget(lines, at(1), 'repeat')).toBe(at(1));
  });
});

/** Phát từ `from` tới `to` theo bước 16ms, trả các thời điểm bị dừng. */
function play(ap: AutoPause, from: number, to: number): number[] {
  const stops: number[] = [];
  for (let t = from; t <= to; t += 16) if (ap.update(lines, t)) stops.push(t);
  return stops;
}

describe('AutoPause', () => {
  it('dừng sau mỗi câu, kể cả hai câu nối liền', () => {
    const ap = new AutoPause();
    const stops = play(ap, 0, 13_000);
    expect(stops).toHaveLength(3);
    stops.forEach((t, i) => {
      expect(t - (lines[i]!.endMs - PAUSE_EARLY_MS)).toBeGreaterThanOrEqual(0);
      expect(t - (lines[i]!.endMs - PAUSE_EARLY_MS)).toBeLessThan(16);
      // Lúc dừng vẫn hiện câu vừa nghe, không phải câu nối liền sau nó.
      expect(findActive(lines, t + PAUSED_LOOKAHEAD_MS)).toBe(i);
    });
  });

  it('vừa tua tới câu (đang dừng) thì hiện câu đích', () => {
    for (const i of [0, 1, 2]) expect(findActive(lines, at(i) + PAUSED_LOOKAHEAD_MS)).toBe(i);
  });

  it('nghe lại từ trước đầu câu (LEAD_MS) chỉ dừng ở cuối câu đó', () => {
    const ap = new AutoPause();
    ap.reset();
    const stops = play(ap, at(1), 6000);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBeGreaterThanOrEqual(5000 - PAUSE_EARLY_MS);
  });

  it('phát tiếp sau khi dừng không dừng lại ngay', () => {
    const ap = new AutoPause();
    const [first] = play(ap, 1000, 3000);
    expect(first).toBeGreaterThanOrEqual(3000 - PAUSE_EARLY_MS);
    expect(play(ap, first! + 16, 4900)).toEqual([]);
  });

  it('nghe lại câu vừa dừng (tua = reset) thì dừng lại ở cuối câu đó', () => {
    const ap = new AutoPause();
    play(ap, 1000, 3000);
    ap.reset();
    expect(play(ap, at(0), 3000)).toHaveLength(1);
  });

  it('tua tới câu mà câu trước chồng lên nó (currentTime lệch dưới 1ms) thì không dừng ngay', () => {
    const overlap = [l(1000, 3100), l(3000, 5000)];
    const ap = new AutoPause();
    ap.reset();
    const stops: number[] = [];
    for (let t = 3000 - LEAD_MS - 0.5; t <= 5000; t += 16) if (ap.update(overlap, t)) stops.push(t);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBeGreaterThanOrEqual(5000 - PAUSE_EARLY_MS);
  });

  it('tua (không qua reset) vào sát cuối câu đang theo dõi thì không dừng nhầm', () => {
    const ap = new AutoPause();
    ap.update(lines, 1500); // đang theo dõi câu 0 (hết lúc 3000)
    expect(ap.update(lines, at(1))).toBe(false); // bấm D: nhảy tới trước câu 1 một chút
    expect(play(ap, at(1) + 16, 5000)).toHaveLength(1); // chỉ dừng ở cuối câu 1
  });

  it('tua lùi về câu vừa dừng thì dừng lại ở cuối câu đó', () => {
    const ap = new AutoPause();
    expect(play(ap, 1000, 3000)).toHaveLength(1);
    expect(play(ap, at(0), 3000)).toHaveLength(1);
  });

  it('sau khi tự dừng (câu sau nối liền): S nghe lại câu vừa nghe, D sang câu kế', () => {
    const [t] = play(new AutoPause(), at(0), 3000);
    expect(navTarget(lines, t!, 'repeat')).toBe(at(0));
    expect(navTarget(lines, t!, 'next')).toBe(at(1));
    const [t1] = play(new AutoPause(), at(1), 5000);
    expect(navTarget(lines, t1!, 'prev')).toBe(at(0));
  });

  it('câu chồng lên câu sau: dừng trước khi câu sau bắt đầu, vẫn hiện câu vừa nghe', () => {
    const overlap = [l(1000, 3100), l(3000, 5000)];
    const ap = new AutoPause();
    const stops: number[] = [];
    for (let t = 950; t <= 5000; t += 16) if (ap.update(overlap, t)) stops.push(t);
    expect(stops).toHaveLength(2);
    expect(stops[0]).toBeLessThan(3000 - PAUSE_EARLY_MS + 16);
    expect(findActive(overlap, stops[0]! + PAUSED_LOOKAHEAD_MS)).toBe(0);
    expect(navTarget(overlap, stops[0]!, 'repeat')).toBe(1000 - LEAD_MS);
  });

  it('pausedStart là đầu câu vừa dừng, kể cả khi dừng trễ sang câu sau', () => {
    const ap = new AutoPause();
    ap.update(lines, 2800);
    expect(ap.update(lines, 3100)).toBe(true); // trễ 180ms, đã sang câu 1
    expect(ap.pausedStart).toBe(1000);
    expect(navTarget(lines, ap.pausedStart!, 'repeat')).toBe(at(0));
    expect(navTarget(lines, ap.pausedStart!, 'next')).toBe(at(1));
  });

  it('tua xa qua cuối câu thì không dừng', () => {
    const ap = new AutoPause();
    ap.update(lines, 2000);
    expect(ap.update(lines, 11_000)).toBe(false);
  });
});

describe('budgetError', () => {
  it('0 là không giới hạn', () => expect(budgetError(100, 0)).toBeNull());
  it('dưới mức thì null, chạm mức thì báo', () => {
    expect(budgetError(0.99, 1)).toBeNull();
    expect(budgetError(1, 1)).toMatch(/\$1\.00/);
  });
});
