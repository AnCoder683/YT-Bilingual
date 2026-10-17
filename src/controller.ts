import { AutoPause, navTarget, PAUSED_LOOKAHEAD_MS, type NavDir } from './nav';
import { findActive } from './overlay/active';
import { Overlay, type Notice } from './overlay/overlay';
import { heuristicLines, Translator, type DisplayLine } from './scheduler';
import { loadSettings, needsRetranslate, onSettingsChanged, pickTarget, type Settings } from './settings';
import { trackKey, type TimedtextInfo } from './timedtext';
import type { Transcript as Parsed } from './transcript';

interface Transcript {
  info: TimedtextInfo;
  parsed: Parsed;
  /** Dòng hiển thị khi không dịch (tắt dịch / cùng ngôn ngữ). */
  plain: DisplayLine[];
}

const log = (...args: unknown[]) => console.log('[yt-bilingual]', ...args);

/** Tiêu đề video, làm ngữ cảnh cho bản dịch. */
function videoTitle(): string {
  const h1 = document.querySelector('ytd-watch-metadata h1')?.textContent?.trim();
  return (h1 || document.title.replace(/ - YouTube$/, '')).slice(0, 200);
}

/** Video đang xem theo URL; ngoài trang /watch (miniplayer) thì null. */
function urlVideoId(): string | null {
  return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
}

const NAV_KEYS: Record<string, NavDir> = { KeyA: 'prev', KeyD: 'next', KeyS: 'repeat' };

/** Đang gõ chữ (ô tìm kiếm, bình luận…) thì không bắt phím. */
function isTyping(e: KeyboardEvent): boolean {
  const el = e.composedPath()[0];
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/**
 * Điều phối: chọn transcript của video hiện tại, đồng bộ theo thời gian video,
 * theo dõi nút CC / quảng cáo / chuyển trang SPA.
 */
export class Controller {
  private overlay = new Overlay();
  private transcript: Transcript | null = null;
  private video: HTMLVideoElement | null = null;
  private player: HTMLElement | null = null;
  private raf = 0;
  private ccObserver: MutationObserver | null = null;
  private ccOn = true;
  private settings: Settings | null = null;
  private translator: Translator | null = null;
  private autoPause = new AutoPause();
  /**
   * startMs của câu vừa tự dừng: khi đang dừng thì hiện câu này và A/D/S tính
   * từ nó (video có thể dừng trễ vài chục ms, khi đó thời gian đã sang câu sau).
   */
  private pin: number | null = null;

  constructor() {
    document.addEventListener('yt-navigate-finish', () => this.onNavigate());
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    void loadSettings().then((s) => {
      this.settings = s;
      this.overlay.setOptions(s.display, s.fontScale);
      this.resetTranslator();
    });
    onSettingsChanged((s) => {
      const prev = this.settings;
      this.settings = s;
      this.overlay.setOptions(s.display, s.fontScale);
      this.autoPause.reset();
      // Chỉ đổi cách hiển thị thì giữ bản dịch; lỗi nặng (key mới…) hoặc đổi
      // ngân sách thì thử lại (đoạn đã dịch lấy lại từ cache, không tốn tiền).
      const budgetChanged = prev?.monthlyBudgetUsd !== s.monthlyBudgetUsd;
      if (!prev || needsRetranslate(prev, s) || budgetChanged || this.translator?.fatal) this.resetTranslator();
      else this.tick();
    });
  }

  /** Tạo lại bộ dịch cho transcript hiện tại theo cài đặt mới nhất. */
  private resetTranslator(): void {
    this.translator = null;
    const t = this.transcript;
    if (!t || !this.settings?.enabled) return this.tick();
    const target = pickTarget(t.info.tlang ?? t.info.lang ?? '', this.settings);
    if (target) {
      this.translator = new Translator(t.info, t.parsed, target, videoTitle, () => this.tick());
      log(`dịch sang ${target} bằng ${this.settings.model}`);
    }
    this.tick();
  }

  /** Track mới nhất của video hiện tại thắng (người dùng vừa đổi track). */
  setTranscript(info: TimedtextInfo, parsed: Parsed): void {
    const current = urlVideoId();
    if (current && info.videoId !== current) return;
    // Player tải lại đúng track cũ: giữ bộ dịch (và bản dịch đã có).
    const prev = this.transcript;
    if (prev && trackKey(prev.info) === trackKey(info) && prev.parsed.tokens.length === parsed.tokens.length) return;
    this.transcript = { info, parsed, plain: heuristicLines(parsed) };
    log(`hiển thị ${parsed.sentences.length} câu`, `${info.lang}${info.kind ? '/' + info.kind : ''}`);
    this.bindPlayer();
    this.resetTranslator();
  }

  private onNavigate(): void {
    const current = urlVideoId();
    if (this.transcript && current && this.transcript.info.videoId !== current) {
      this.transcript = null;
      this.translator = null;
      this.overlay.setEnabled(false);
    }
  }

  private bindPlayer(): void {
    const player = document.querySelector<HTMLElement>('#movie_player');
    const video = player?.querySelector<HTMLVideoElement>('video.html5-main-video') ?? null;
    if (!player || !video) return;
    this.overlay.attach(player);

    if (video !== this.video) {
      video.addEventListener('seeking', () => {
        this.autoPause.reset();
        this.pin = null;
      });
      video.addEventListener('play', () => (this.pin = null));
      for (const ev of ['play', 'seeked', 'timeupdate', 'pause', 'ratechange'] as const) {
        video.addEventListener(ev, () => this.tick());
      }
      this.video = video;
    }

    if (player !== this.player) {
      this.player = player;
      this.ccObserver?.disconnect();
      const btn = player.querySelector<HTMLElement>('.ytp-subtitles-button');
      if (btn) {
        this.ccOn = btn.getAttribute('aria-pressed') !== 'false';
        this.ccObserver = new MutationObserver(() => {
          this.ccOn = btn.getAttribute('aria-pressed') !== 'false';
          this.tick();
        });
        this.ccObserver.observe(btn, { attributes: true, attributeFilter: ['aria-pressed'] });
      }
    }
  }

  /** Video đang phát đúng là video của transcript và không phải quảng cáo. */
  private isOurs(transcript: Transcript, player: HTMLElement): boolean {
    return !player.classList.contains('ad-showing') && (urlVideoId() ?? transcript.info.videoId) === transcript.info.videoId;
  }

  private lines(transcript: Transcript): readonly DisplayLine[] {
    return this.translator ? this.translator.lines() : transcript.plain;
  }

  /** Phím A / D / S: lùi, tiến, nghe lại một câu. */
  private onKey(e: KeyboardEvent): void {
    const dir = NAV_KEYS[e.code];
    const { transcript, video, player } = this;
    if (!dir || !this.settings?.shortcuts || !transcript || !video || !player) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || isTyping(e)) return;
    if (!this.isOurs(transcript, player)) return;
    const tMs = video.paused && this.pin !== null ? this.pin : video.currentTime * 1000;
    const to = navTarget(this.lines(transcript), tMs, dir);
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    video.currentTime = to / 1000;
    // Nghe lại thì phát luôn; ở chế độ tự dừng, chuyển câu cũng phát câu đó.
    if (video.paused && (dir === 'repeat' || this.settings.autoPause)) void video.play();
  }

  private notice(tr: Translator | null, tMs: number): Notice | null {
    if (!tr) return null;
    if (tr.fatal) return { kind: 'error', text: `⚠ ${tr.fatal.message}` };
    const st = tr.statusAt(tMs);
    if (st?.kind === 'error') return { kind: 'error', text: `⚠ ${st.message} — sẽ thử lại` };
    if (st?.kind === 'blocked') return { kind: 'error', text: `⚠ ${st.message}` };
    if (st?.kind === 'pending') return { kind: 'pending', text: 'đang dịch…' };
    return null;
  }

  /** Cập nhật 1 khung; tự lặp bằng rAF khi video đang chạy. */
  private tick = (): void => {
    cancelAnimationFrame(this.raf);
    const { transcript, video, player } = this;
    if (!transcript || !video || !player) return;

    const ours = this.isOurs(transcript, player);
    const showing = this.ccOn && ours;
    this.overlay.attach(player);
    this.overlay.setEnabled(showing);

    const tMs = video.currentTime * 1000;
    if (showing) {
      const tr = this.translator;
      tr?.ensureAround(tMs);
      const lines = this.lines(transcript);
      const tShow = !video.paused ? tMs : (this.pin ?? tMs + PAUSED_LOOKAHEAD_MS);
      const line = lines[findActive(lines, tShow)] ?? null;
      this.overlay.show(line?.source ?? null, line?.translation ?? null, this.notice(tr, tMs));
    }
    if (ours && this.settings?.autoPause && !video.paused && this.autoPause.update(this.lines(transcript), tMs)) {
      this.pin = this.autoPause.pausedStart;
      video.pause(); // sự kiện pause gọi lại tick → hiện câu đã ghim
    }
    if (!video.paused) this.raf = requestAnimationFrame(this.tick);
  };
}
