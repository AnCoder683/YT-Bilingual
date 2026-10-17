import { sendToBackground, type StorageResponse, type TestKeyResponse } from '@/src/messages';
import { API_KEY_STORAGE, CACHE_DAYS, DISPLAY_MODES, loadSettings, MODELS, saveSettings, TARGET_LANGS, type Settings } from '@/src/settings';
import { budgetError, loadUsage } from '@/src/translate/usage';
import { loadVocab } from '@/src/vocab';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const enabled = $<HTMLInputElement>('enabled');
const apiKey = $<HTMLInputElement>('apiKey');
const keyStatus = $<HTMLParagraphElement>('keyStatus');
const model = $<HTMLSelectElement>('model');
const targetLang = $<HTMLSelectElement>('targetLang');
const altTargetLang = $<HTMLSelectElement>('altTargetLang');
const display = $<HTMLElement>('display');
const fontScale = $<HTMLInputElement>('fontScale');
const fontScaleValue = $<HTMLSpanElement>('fontScaleValue');
const panel = $<HTMLInputElement>('panel');
const shortcuts = $<HTMLInputElement>('shortcuts');
const autoPause = $<HTMLInputElement>('autoPause');
const budget = $<HTMLInputElement>('budget');
const budgetBar = $<HTMLProgressElement>('budgetBar');
const budgetStatus = $<HTMLParagraphElement>('budgetStatus');
const cacheDays = $<HTMLSelectElement>('cacheDays');
const clearCache = $<HTMLButtonElement>('clearCache');
const cacheStatus = $<HTMLParagraphElement>('cacheStatus');

function fill(select: HTMLSelectElement, items: readonly { value: string; label: string }[]) {
  select.replaceChildren(...items.map((i) => new Option(i.label, i.value)));
}

function setStatus(text: string, kind: 'ok' | 'err' | '' = '') {
  keyStatus.textContent = text;
  keyStatus.className = `status ${kind}`;
}

const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

// ---------- Mục gập/mở ----------

const OPEN_KEY = 'popupOpenSection';
const sections = [...document.querySelectorAll<HTMLDetailsElement>('details[name="sec"]')];

function openSection(id: string) {
  const d = $<HTMLDetailsElement>(`sec-${id}`);
  d.open = true;
  d.scrollIntoView({ block: 'nearest' });
}

// Nhớ mục đang mở cho lần mở popup sau (tiện ích, không quan trọng nếu mất).
for (const d of sections) {
  d.addEventListener('toggle', () => {
    if (!d.open && sections.some((x) => x.open)) return; // đóng do mục khác mở
    try {
      localStorage.setItem(OPEN_KEY, d.open ? d.id : '');
    } catch {}
  });
}

/** Dòng tóm tắt bên phải mỗi mục. */
function setSum(id: string, text: string, err = false) {
  const s = $(id);
  s.textContent = text;
  s.classList.toggle('err', err);
}

// ---------- Trạng thái ----------

let settings: Settings;
let keyTail = '';
let monthUsd = 0;

function refreshSummaries() {
  const m = MODELS.find((x) => x.id === settings.model);
  const lang = TARGET_LANGS.find((l) => l.code === settings.targetLang);
  // "Video tiếng Việt thì dịch sang" — nhãn theo ngôn ngữ đích chính.
  const name = lang ? lang.label.replace(/^Tiếng /, 'tiếng ') : settings.targetLang;
  $('altLabel').textContent = `Video ${name} thì dịch sang`;
  setSum('sumDich', `${m?.label.split(' — ')[0] ?? settings.model} → ${lang?.label ?? settings.targetLang}`);

  const mode = DISPLAY_MODES.find((d) => d.value === settings.display);
  setSum('sumHien', `${mode?.label ?? ''} · ${Math.round(settings.fontScale * 100)}%`);

  const learn = [settings.panel && 'Bảng', settings.shortcuts && 'Phím tắt', settings.autoPause && 'Tự dừng'].filter(Boolean);
  setSum('sumHoc', learn.length ? learn.join(' · ') : 'Tắt hết');

  const limit = settings.monthlyBudgetUsd;
  const over = limit > 0 && budgetError(monthUsd, limit);
  setSum('sumChi', limit > 0 ? `${usd(monthUsd)} / $${limit}` : 'Không giới hạn', !!over);

  setSum('sumKey', keyTail ? `✓ …${keyTail}` : 'Chưa có key', !keyTail);

  const line = $('statusLine');
  line.textContent = settings.enabled ? 'Đang bật' : 'Đang tắt';
  if (!keyTail) {
    const warn = document.createElement('span');
    warn.className = 'err';
    warn.textContent = ' · chưa có API key';
    line.append(warn);
  }
}

function renderDisplay() {
  display.replaceChildren(
    ...DISPLAY_MODES.map((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = d.label;
      b.setAttribute('aria-pressed', String(d.value === settings.display));
      b.onclick = () => {
        void persist({ display: d.value });
        renderDisplay();
      };
      return b;
    }),
  );
}

async function persist(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  refreshSummaries();
  await saveSettings(settings);
}

async function init() {
  fill(model, MODELS.map((m) => ({ value: m.id, label: m.label })));
  const langs = TARGET_LANGS.map((l) => ({ value: l.code, label: l.label }));
  fill(targetLang, langs);
  fill(altTargetLang, langs);
  fill(cacheDays, CACHE_DAYS.map((d) => ({ value: String(d.value), label: d.label.replace(/^Sau (.*) không mở$/, '$1') })));

  settings = await loadSettings();
  enabled.checked = settings.enabled;
  model.value = settings.model;
  targetLang.value = settings.targetLang;
  altTargetLang.value = settings.altTargetLang;
  renderDisplay();
  fontScale.value = String(settings.fontScale);
  const showScale = () => (fontScaleValue.textContent = `${Math.round(Number(fontScale.value) * 100)}%`);
  showScale();
  panel.checked = settings.panel;
  shortcuts.checked = settings.shortcuts;
  autoPause.checked = settings.autoPause;
  budget.value = String(settings.monthlyBudgetUsd);
  cacheDays.value = String(settings.cacheDays);

  const stored = (await browser.storage.local.get(API_KEY_STORAGE))[API_KEY_STORAGE];
  if (typeof stored === 'string' && stored) {
    keyTail = stored.slice(-4);
    apiKey.placeholder = `Đã lưu: …${keyTail}`;
  } else {
    setStatus('Dán key vào ô trên rồi bấm Lưu key.', 'err');
  }

  const u = await loadUsage();
  monthUsd = u.monthUsd;
  refreshSummaries();

  // Chưa có key thì mở sẵn mục API key; không thì mở lại mục lần trước.
  let last = '';
  try {
    last = localStorage.getItem(OPEN_KEY) ?? '';
  } catch {}
  if (!keyTail) openSection('key');
  else if (last && document.getElementById(last)) $<HTMLDetailsElement>(last).open = true;

  enabled.onchange = () => persist({ enabled: enabled.checked });
  model.onchange = () => persist({ model: model.value as Settings['model'] });
  targetLang.onchange = () => persist({ targetLang: targetLang.value });
  altTargetLang.onchange = () => persist({ altTargetLang: altTargetLang.value });
  fontScale.oninput = showScale;
  fontScale.onchange = () => persist({ fontScale: Number(fontScale.value) });
  panel.onchange = () => persist({ panel: panel.checked });
  shortcuts.onchange = () => persist({ shortcuts: shortcuts.checked });
  autoPause.onchange = () => persist({ autoPause: autoPause.checked });
  budget.onchange = async () => {
    const v = Math.max(0, Number(budget.value) || 0);
    budget.value = String(v);
    await persist({ monthlyBudgetUsd: v });
    showBudget(monthUsd, v);
  };

  cacheDays.onchange = async () => {
    await persist({ cacheDays: Number(cacheDays.value) });
    await showStorage({ type: 'storage_stats' });
  };

  // Bấm hai lần để xóa (popup không nên dùng confirm()).
  let armed: ReturnType<typeof setTimeout> | undefined;
  const label = clearCache.textContent;
  clearCache.onclick = async () => {
    if (!armed) {
      clearCache.textContent = 'Bấm lần nữa để xóa';
      clearCache.classList.add('armed');
      armed = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    await showStorage({ type: 'storage_clear' });
  };
  function disarm() {
    clearTimeout(armed);
    armed = undefined;
    clearCache.textContent = label;
    clearCache.classList.remove('armed');
  }

  $('toggleKey').onclick = () => {
    apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
  };

  $('saveKey').onclick = async () => {
    const key = apiKey.value.trim();
    if (!key) return setStatus('Dán key vào ô trên trước đã.', 'err');
    if (!key.startsWith('sk-ant-')) return setStatus('Key Claude bắt đầu bằng "sk-ant-".', 'err');
    await browser.storage.local.set({ [API_KEY_STORAGE]: key });
    apiKey.value = '';
    keyTail = key.slice(-4);
    apiKey.placeholder = `Đã lưu: …${keyTail}`;
    refreshSummaries();
    await testKey();
  };
  $('testKey').onclick = testKey;

  $('openVocab').onclick = () => void browser.tabs.create({ url: browser.runtime.getURL('/vocab.html') });
  $('costTile').onclick = () => openSection('chi');
  const vocab = await loadVocab();
  $('vocabCount').textContent = `${vocab.length} từ`;

  $('monthTile').textContent = usd(u.monthUsd);
  $('monthUsd').textContent = usd(u.monthUsd);
  $('totalUsd').textContent = usd(u.totalUsd);
  showBudget(u.monthUsd, settings.monthlyBudgetUsd);
  await showStorage({ type: 'storage_stats' });
}

/** storage.local của extension giới hạn 10 MB (sổ từ vựng nằm ở đây). */
const LOCAL_QUOTA = 10 * 1024 * 1024;

async function showStorage(req: { type: 'storage_stats' | 'storage_clear' }) {
  const res = await sendToBackground<StorageResponse>(req);
  if (!res.ok) {
    cacheStatus.textContent = res.message;
    cacheStatus.className = 'status err';
    return;
  }
  const { translations: t, lookups: l } = res.stats;
  $('cacheTr').textContent = t.entries ? `${t.videos} video · ${bytes(t.bytes)}` : 'Trống';
  $('cacheLk').textContent = l.entries ? `${l.entries} mục · ${bytes(l.bytes)}` : 'Trống';
  if (req.type === 'storage_clear') {
    cacheStatus.textContent = '✓ Đã xóa.';
    cacheStatus.className = 'status ok';
  } else if (res.pruned) {
    cacheStatus.textContent = `Đã tự xóa ${res.pruned} bản ghi lâu không dùng.`;
    cacheStatus.className = 'status';
  }

  const vocab = await loadVocab();
  const vocabSize = new TextEncoder().encode(JSON.stringify(vocab)).length;
  $('vocabBytes').textContent = vocab.length ? `${vocab.length} từ · ${bytes(vocabSize)}` : 'Trống';
  const local = (await browser.storage.local.getBytesInUse?.(null)) ?? vocabSize;
  const ratio = local / LOCAL_QUOTA;
  const bar = $<HTMLProgressElement>('localBar');
  bar.value = Math.min(1, ratio);
  bar.classList.toggle('warn', ratio >= 0.8);
  const status = $('localStatus');
  status.textContent = `${bytes(local)} / 10 MB cho sổ từ vựng và cài đặt${ratio >= 0.8 ? ' — sắp đầy, nên xuất sổ ra file rồi xóa bớt' : ''}`;
  setSum('sumMem', bytes(t.bytes + l.bytes + local), ratio >= 0.8);
}

/** Thanh tiến độ ngân sách (trong mục và trên ô "Tháng này"); từ 80% thì đổi màu cảnh báo. */
function showBudget(month: number, limit: number) {
  const on = limit > 0;
  const tileBar = $<HTMLProgressElement>('tileBar');
  budgetBar.hidden = budgetStatus.hidden = tileBar.hidden = !on;
  if (!on) return;
  const pct = Math.round((month / limit) * 100);
  const warn = pct >= 80;
  for (const bar of [budgetBar, tileBar]) {
    bar.value = Math.min(1, month / limit);
    bar.classList.toggle('warn', warn);
  }
  const over = budgetError(month, limit);
  budgetStatus.textContent = over
    ? 'Đã chạm giới hạn: tạm ngừng dịch mới (bản đã dịch vẫn xem được).'
    : `${pct}% của $${limit}${warn ? ' — sắp chạm giới hạn' : ''}`;
  budgetStatus.className = `status ${warn ? 'err' : ''}`;
}

async function testKey() {
  setStatus('Đang kiểm tra…');
  const res = await sendToBackground<TestKeyResponse>({ type: 'test_key' });
  if (res.ok) setStatus('✓ Key hợp lệ (kiểm tra miễn phí, không tốn token).', 'ok');
  else {
    setStatus(res.message, 'err');
    if (res.error !== 'network') setSum('sumKey', '✗ Key lỗi', true);
  }
}

void init();
