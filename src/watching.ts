/** Video trên URL nếu đang ở trang /watch, ngoài ra null. */
export function watchVideoId(loc: { pathname: string; search: string }): string | null {
  return loc.pathname === '/watch' ? new URLSearchParams(loc.search).get('v') : null;
}

/**
 * Video người dùng đang xem, tức video duy nhất được dịch (tốn tiền):
 * - trang /watch: video trên URL;
 * - đã rời /watch nhưng miniplayer phát tiếp: video đang có (`currentId`);
 * - còn lại (trang chủ, tìm kiếm, Shorts…): không có. Player xem trước khi rê
 *   chuột lên thumbnail cũng tải phụ đề, những phụ đề đó phải bỏ qua.
 */
export function watchedVideo(urlId: string | null, miniplayer: boolean, currentId: string | null): string | null {
  return urlId ?? (miniplayer ? currentId : null);
}
