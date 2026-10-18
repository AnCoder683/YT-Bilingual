import { describe, expect, it } from 'vitest';
import { watchedVideo, watchVideoId } from '@/src/watching';

describe('watchVideoId', () => {
  it('lấy v trên trang /watch', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=abc&t=10s' })).toBe('abc');
  });

  it('ngoài /watch thì null', () => {
    expect(watchVideoId({ pathname: '/', search: '' })).toBeNull();
    expect(watchVideoId({ pathname: '/results', search: '?search_query=a' })).toBeNull();
    expect(watchVideoId({ pathname: '/shorts/abc', search: '' })).toBeNull();
  });
});

describe('watchedVideo', () => {
  it('trang /watch: chỉ video trên URL, kể cả khi đang có video khác', () => {
    expect(watchedVideo('abc', false, null)).toBe('abc');
    expect(watchedVideo('abc', false, 'old')).toBe('abc');
  });

  it('trang chủ / tìm kiếm không có miniplayer: không dịch gì (player xem trước bị bỏ qua)', () => {
    expect(watchedVideo(null, false, null)).toBeNull();
    expect(watchedVideo(null, false, 'old')).toBeNull();
  });

  it('miniplayer phát tiếp: giữ video đang có, không nhận video mới', () => {
    expect(watchedVideo(null, true, 'abc')).toBe('abc');
    expect(watchedVideo(null, true, null)).toBeNull();
  });
});
