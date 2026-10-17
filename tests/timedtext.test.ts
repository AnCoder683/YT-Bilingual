import { describe, expect, it } from 'vitest';
import { parseTimedtextUrl, trackKey } from '@/src/timedtext';

describe('parseTimedtextUrl', () => {
  it('nhận URL timedtext ASR tương đối', () => {
    const info = parseTimedtextUrl(
      '/api/timedtext?v=3PCyK5Wwoi8&caps=asr&kind=asr&lang=vi&fmt=json3&pot=abc',
      'https://www.youtube.com/watch?v=3PCyK5Wwoi8',
    );
    expect(info).toEqual({ videoId: '3PCyK5Wwoi8', lang: 'vi', kind: 'asr', tlang: null, fmt: 'json3' });
  });

  it('nhận track đã bật tự động dịch', () => {
    const info = parseTimedtextUrl('https://www.youtube.com/api/timedtext?v=x&lang=en&tlang=vi&fmt=json3');
    expect(info?.tlang).toBe('vi');
    expect(trackKey(info!)).toBe('x|en|manual|vi');
  });

  it('bỏ qua URL khác', () => {
    expect(parseTimedtextUrl('https://www.youtube.com/youtubei/v1/log_event?alt=json')).toBeNull();
    expect(parseTimedtextUrl('https://evil.example/api/timedtext?v=x')).toBeNull();
    expect(parseTimedtextUrl('::not a url')).toBeNull();
  });
});
