import { LookupCard, type CloseReason } from './lookup/card';
import { sendToBackground, type LookupResponse, type LookupResult } from './messages';
import { AutoPause, LEAD_MS, navTarget, PAUSED_LOOKAHEAD_MS, type NavDir } from './nav';
import { findActive } from './overlay/active';
import { Overlay, type Notice } from './overlay/overlay';
import { TranscriptPanel } from './panel/panel';
import { heuristicLines, Translator, type DisplayLine } from './scheduler';
import { loadSettings, needsRetranslate, onSettingsChanged, pickTarget, type Settings } from './settings';
import { trackKey, type TimedtextInfo } from './timedtext';
import type { Transcript as Parsed } from './transcript';
import { addVocab, hasVocab } from './vocab';

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
  private panel = new TranscriptPanel(
    (ms) => this.seekTo(ms),
    (p) => this.startLookup(p.text, p.line, p.rect, false),
  );
  private layoutObserver: MutationObserver | null = null;
  /** Dòng đang hiện trên video (để biết câu chứa chữ vừa bấm). */
  private shownLine: DisplayLine | null = null;
  private card = new LookupCard({
    onSave: () => void this.saveLookup(),
    onClose: (reason) => this.onCardClose(reason),
  });
  /** Lần tra đang mở; `resume`: chính extension đã dừng video, đóng ô thì phát tiếp. */
  private lookup: { picked: string; line: DisplayLine; result: LookupResult | null; resume: boolean; seq: number } | null = null;
  private lookupSeq = 0;

  constructor() {
    this.overlay.onPick = (p) => {
      if (this.shownLine) this.startLookup(p.text, this.shownLine, p.rect, true);
    };
    document.addEventListener('yt-navigate-finish', () => this.onNavigate());
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    // Đổi bố cục (cửa sổ hẹp ↔ rộng, toàn màn hình) khi video đang dừng: đặt lại bảng.
    window.addEventListener('resize', () => this.tick());
    document.addEventListener('fullscreenchange', () => this.tick());
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
    this.overlay.setLang(info.tlang ?? info.lang ?? 'en');
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
      this.panel.hide();
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
        this.card.close('external');
      });
      video.addEventListener('play', () => {
        this.pin = null;
        this.card.close('external');
      });
      for (const ev of ['play', 'seeked', 'timeupdate', 'pause', 'ratechange'] as const) {
        video.addEventListener(ev, () => this.tick());
      }
      this.video = video;
    }

    const flexy = document.querySelector('ytd-watch-flexy');
    if (flexy && !this.layoutObserver) {
      // Rạp hát / một cột / hai cột: YouTube đổi thuộc tính trên ytd-watch-flexy.
      this.layoutObserver = new MutationObserver(() => this.tick());
      this.layoutObserver.observe(flexy, { attributes: true, attributeFilter: ['theater', 'is-two-columns_', 'fullscreen'] });
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

  /** Bấm / kéo chọn chữ (trên phụ đề hoặc bôi đen trong bảng): dừng video và tra. */
  private async startLookup(picked: string, line: DisplayLine, rect: DOMRect, onVideo: boolean): Promise<void> {
    const { video, transcript, settings } = this;
    if (!video || !transcript) return;
    const resume = this.lookup?.resume ?? !video.paused;
    const seq = ++this.lookupSeq;
    this.lookup = { picked, line, result: null, resume, seq };
    if (!video.paused) video.pause();
    if (onVideo) this.pin = line.startMs; // giữ đúng câu này trên màn hình khi dừng
    this.card.open(rect, picked, line.source, onVideo || !!document.fullscreenElement);

    const sourceLang = transcript.info.tlang ?? transcript.info.lang ?? 'en';
    const targetLang = (settings && pickTarget(sourceLang, settings)) ?? settings?.targetLang ?? 'vi';
    const res = await sendToBackground<LookupResponse>({
      type: 'lookup',
      picked,
      sentence: line.source,
      translation: line.translation ?? '',
      title: videoTitle(),
      sourceLang,
      targetLang,
      videoId: transcript.info.videoId ?? '',
    }).catch((err): LookupResponse => ({ ok: false, error: 'other', message: String(err) }));
    if (this.lookup?.seq !== seq || !this.card.opened) return;
    if (!res.ok) return this.card.setError(res.message);
    this.lookup.result = res.result;
    this.card.setResult(res.result, await hasVocab(res.result.term, line.source));
  }

  private async saveLookup(): Promise<void> {
    const l = this.lookup;
    if (!l?.result || !this.transcript) return;
    await addVocab({
      ...l.result,
      picked: l.picked,
      sentence: l.line.source,
      translation: l.line.translation ?? '',
      videoId: this.transcript.info.videoId ?? '',
      title: videoTitle(),
      tMs: l.line.startMs,
    });
    if (this.lookup === l) this.card.setSaved(true);
  }

  private onCardClose(reason: CloseReason): void {
    this.overlay.clearPick();
    const l = this.lookup;
    this.lookup = null;
    const video = this.video;
    if (!l || !video) return;
    if (reason === 'replay') return this.seekTo(l.line.startMs);
    // Bấm vào video để đóng: YouTube tự phát tiếp bằng chính cú bấm đó.
    if (l.resume && video.paused && (reason === 'esc' || reason === 'button' || reason === 'outside')) void video.play();
  }

  /** Bấm vào câu trong bảng transcript: tua tới đầu câu và phát. */
  private seekTo(startMs: number): void {
    const video = this.video;
    if (!video) return;
    video.currentTime = Math.max(0, startMs - LEAD_MS) / 1000;
    if (video.paused) void video.play();
  }

  /** Phím A / D / S: lùi, tiến, nghe lại một câu; Q: bật/tắt bảng transcript. */
  private onKey(e: KeyboardEvent): void {
    const dir = NAV_KEYS[e.code];
    const { transcript, video, player } = this;
    if (!(dir || e.code === 'KeyQ') || !this.settings?.shortcuts || !transcript || !video || !player) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || isTyping(e)) return;
    if (!this.isOurs(transcript, player)) return;
    if (!dir) {
      if (!this.settings.panel) return;
      e.preventDefault();
      e.stopPropagation();
      this.panel.toggle();
      return this.tick();
    }
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
    const panelOn = ours && !!this.settings?.panel;
    this.panel.attach(player, panelOn);
    // Tắt CC vẫn xem được bảng: vẫn dịch đoạn đang xem.
    if (showing || panelOn) this.translator?.ensureAround(tMs);
    if (panelOn) this.panel.update(this.lines(transcript), tMs);
    if (showing) {
      const tr = this.translator;
      const lines = this.lines(transcript);
      const tShow = !video.paused ? tMs : (this.pin ?? tMs + PAUSED_LOOKAHEAD_MS);
      const line = lines[findActive(lines, tShow)] ?? null;
      this.shownLine = line;
      this.overlay.show(line?.source ?? null, line?.translation ?? null, this.notice(tr, tMs));
    }
    if (ours && this.settings?.autoPause && !video.paused && this.autoPause.update(this.lines(transcript), tMs)) {
      this.pin = this.autoPause.pausedStart;
      video.pause(); // sự kiện pause gọi lại tick → hiện câu đã ghim
    }
    if (!video.paused) this.raf = requestAnimationFrame(this.tick);
  };
}
