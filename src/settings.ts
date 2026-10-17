export type ModelId = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5';

export interface ModelInfo {
  id: ModelId;
  label: string;
  /** USD / 1M token (giá bậc thấp: prompt ≤ 100k token, luôn đúng với lô phụ đề). */
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Bật server-side fallback khi bị từ chối (chỉ Opus/Sonnet 5.5 trên Claude API). */
  fallback: boolean;
}

// Giá theo platform.claude.com/docs (tra ngày 2026-10-17).
export const MODELS: readonly ModelInfo[] = [
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5 — rẻ nhất', input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01, fallback: false },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — cân bằng', input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1, fallback: true },
  { id: 'claude-opus-5-5', label: 'Opus 5.5 — dịch hay nhất', input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2, fallback: true },
];

export const TARGET_LANGS: readonly { code: string; label: string }[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-Hans', label: '中文 (简体)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
];

export interface Settings {
  model: ModelId;
  /** Ngôn ngữ đích chính. */
  targetLang: string;
  /** Dùng khi video đã ở ngôn ngữ đích chính (vd video tiếng Việt → dịch sang đây). */
  altTargetLang: string;
  enabled: boolean;
  /** Dòng nào hiện: cả hai, chỉ bản dịch, hay chỉ bản gốc (đã chia câu, thêm dấu câu). */
  display: DisplayMode;
  /** Hệ số cỡ chữ so với mặc định (theo chiều cao player). */
  fontScale: number;
  /** Phím A/D/S: lùi / tiến / nghe lại một câu. */
  shortcuts: boolean;
  /** Tự dừng video sau mỗi câu (luyện nghe). */
  autoPause: boolean;
  /** Chi tối đa mỗi tháng (USD, theo ước tính trong popup); 0 = không giới hạn. */
  monthlyBudgetUsd: number;
}

export type DisplayMode = 'both' | 'target' | 'source';

export const DISPLAY_MODES: readonly { value: DisplayMode; label: string }[] = [
  { value: 'both', label: 'Song ngữ' },
  { value: 'target', label: 'Chỉ bản dịch' },
  { value: 'source', label: 'Chỉ bản gốc' },
];

export const DEFAULT_SETTINGS: Settings = {
  model: 'claude-sonnet-5-5',
  targetLang: 'vi',
  altTargetLang: 'en',
  enabled: true,
  display: 'both',
  fontScale: 1,
  shortcuts: true,
  autoPause: false,
  monthlyBudgetUsd: 0,
};

/** Đổi các trường này thì phải dịch lại; các trường khác chỉ đổi cách hiển thị. */
export function needsRetranslate(a: Settings, b: Settings): boolean {
  return a.model !== b.model || a.targetLang !== b.targetLang || a.altTargetLang !== b.altTargetLang || a.enabled !== b.enabled;
}

export const API_KEY_STORAGE = 'anthropicApiKey';
const SETTINGS_STORAGE = 'settings';

export async function loadSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(SETTINGS_STORAGE);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_STORAGE] as Partial<Settings> | undefined) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_STORAGE]: s });
}

/** Gọi lại khi cài đặt hoặc API key đổi (key mới thì cần dịch lại phần đã lỗi). */
export function onSettingsChanged(cb: (s: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[SETTINGS_STORAGE] || changes[API_KEY_STORAGE])) {
      void loadSettings().then(cb);
    }
  });
}

export function modelInfo(id: string): ModelInfo {
  return MODELS.find((m) => m.id === id) ?? MODELS[1]!;
}

const base = (lang: string) => lang.toLowerCase().split('-')[0]!;

/** Chọn ngôn ngữ đích cho một track nguồn; null nếu không cần dịch. */
export function pickTarget(sourceLang: string, s: Settings): string | null {
  if (base(sourceLang) !== base(s.targetLang)) return s.targetLang;
  if (base(sourceLang) !== base(s.altTargetLang)) return s.altTargetLang;
  return null;
}
