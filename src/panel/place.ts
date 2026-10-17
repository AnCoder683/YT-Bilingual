/**
 * Chỗ đặt bảng transcript theo bố cục YouTube:
 * - side: màn hình rộng (hai cột), đầu cột phải, cao bằng video;
 * - theater: chế độ rạp hát, đầu cột phải bên dưới video, dính khi cuộn;
 * - below: màn hình hẹp (một cột), ngay dưới video;
 * - overlay: toàn màn hình, lớp phủ bên phải video (bật/tắt bằng phím).
 */
export type PanelPlace = 'side' | 'theater' | 'below' | 'overlay';

export interface LayoutFlags {
  fullscreen: boolean;
  twoColumns: boolean;
  theater: boolean;
}

export function pickPlace(f: LayoutFlags): PanelPlace {
  if (f.fullscreen) return 'overlay';
  if (!f.twoColumns) return 'below';
  return f.theater ? 'theater' : 'side';
}

export function readLayout(player: HTMLElement): LayoutFlags {
  const flexy = document.querySelector('ytd-watch-flexy');
  return {
    fullscreen: !!document.fullscreenElement || player.classList.contains('ytp-fullscreen'),
    twoColumns: !!flexy?.hasAttribute('is-two-columns_'),
    theater: !!flexy?.hasAttribute('theater'),
  };
}

/** Phần tử chứa bảng cho từng chỗ đặt (bảng được chèn ở đầu), hoặc null nếu chưa có. */
export function containerFor(place: PanelPlace, player: HTMLElement): HTMLElement | null {
  switch (place) {
    case 'overlay':
      return player;
    case 'below':
      return document.querySelector<HTMLElement>('ytd-watch-flexy #below');
    default:
      return document.querySelector<HTMLElement>('ytd-watch-flexy #secondary-inner');
  }
}
