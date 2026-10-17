import { sendToBackground, type TestKeyResponse } from '@/src/messages';
import { API_KEY_STORAGE, DISPLAY_MODES, loadSettings, MODELS, saveSettings, TARGET_LANGS, type Settings } from '@/src/settings';
import { budgetError, loadUsage } from '@/src/translate/usage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const enabled = $<HTMLInputElement>('enabled');
const apiKey = $<HTMLInputElement>('apiKey');
const keyStatus = $<HTMLParagraphElement>('keyStatus');
const model = $<HTMLSelectElement>('model');
const targetLang = $<HTMLSelectElement>('targetLang');
const altTargetLang = $<HTMLSelectElement>('altTargetLang');
const display = $<HTMLSelectElement>('display');
const fontScale = $<HTMLInputElement>('fontScale');
const fontScaleValue = $<HTMLSpanElement>('fontScaleValue');
const panel = $<HTMLInputElement>('panel');
const shortcuts = $<HTMLInputElement>('shortcuts');
const autoPause = $<HTMLInputElement>('autoPause');
const budget = $<HTMLInputElement>('budget');
const budgetBar = $<HTMLProgressElement>('budgetBar');
const budgetStatus = $<HTMLParagraphElement>('budgetStatus');

function fill(select: HTMLSelectElement, items: readonly { value: string; label: string }[]) {
  select.replaceChildren(...items.map((i) => new Option(i.label, i.value)));
}

function setStatus(text: string, kind: 'ok' | 'err' | '' = '') {
  keyStatus.textContent = text;
  keyStatus.className = `status ${kind}`;
}

const usd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

async function init() {
  fill(model, MODELS.map((m) => ({ value: m.id, label: m.label })));
  const langs = TARGET_LANGS.map((l) => ({ value: l.code, label: l.label }));
  fill(targetLang, langs);
  fill(altTargetLang, langs);
  fill(display, DISPLAY_MODES);

  let settings = await loadSettings();
  enabled.checked = settings.enabled;
  model.value = settings.model;
  targetLang.value = settings.targetLang;
  altTargetLang.value = settings.altTargetLang;
  display.value = settings.display;
  fontScale.value = String(settings.fontScale);
  const showScale = () => (fontScaleValue.textContent = `${Math.round(Number(fontScale.value) * 100)}%`);
  showScale();
  panel.checked = settings.panel;
  shortcuts.checked = settings.shortcuts;
  autoPause.checked = settings.autoPause;
  budget.value = String(settings.monthlyBudgetUsd);

  const stored = (await browser.storage.local.get(API_KEY_STORAGE))[API_KEY_STORAGE];
  if (typeof stored === 'string' && stored) {
    apiKey.placeholder = `Đã lưu: …${stored.slice(-4)}`;
    setStatus('Đã có key.');
  } else {
    setStatus('Chưa có key.', 'err');
  }

  const persist = async (patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    await saveSettings(settings);
  };
  enabled.onchange = () => persist({ enabled: enabled.checked });
  model.onchange = () => persist({ model: model.value as Settings['model'] });
  targetLang.onchange = () => persist({ targetLang: targetLang.value });
  altTargetLang.onchange = () => persist({ altTargetLang: altTargetLang.value });
  display.onchange = () => persist({ display: display.value as Settings['display'] });
  fontScale.oninput = showScale;
  fontScale.onchange = () => persist({ fontScale: Number(fontScale.value) });
  panel.onchange = () => persist({ panel: panel.checked });
  shortcuts.onchange = () => persist({ shortcuts: shortcuts.checked });
  autoPause.onchange = () => persist({ autoPause: autoPause.checked });
  budget.onchange = async () => {
    const v = Math.max(0, Number(budget.value) || 0);
    budget.value = String(v);
    await persist({ monthlyBudgetUsd: v });
    showBudget(u.monthUsd, v);
  };

  $('toggleKey').onclick = () => {
    apiKey.type = apiKey.type === 'password' ? 'text' : 'password';
  };

  $('saveKey').onclick = async () => {
    const key = apiKey.value.trim();
    if (!key) return setStatus('Dán key vào ô trên trước đã.', 'err');
    if (!key.startsWith('sk-ant-')) return setStatus('Key Claude bắt đầu bằng "sk-ant-".', 'err');
    await browser.storage.local.set({ [API_KEY_STORAGE]: key });
    apiKey.value = '';
    apiKey.placeholder = `Đã lưu: …${key.slice(-4)}`;
    await testKey();
  };
  $('testKey').onclick = testKey;

  const u = await loadUsage();
  $('monthUsd').textContent = usd(u.monthUsd);
  $('totalUsd').textContent = usd(u.totalUsd);
  showBudget(u.monthUsd, settings.monthlyBudgetUsd);
}

/** Thanh tiến độ ngân sách; từ 80% thì đổi màu cảnh báo. */
function showBudget(monthUsd: number, limit: number) {
  const on = limit > 0;
  budgetBar.hidden = budgetStatus.hidden = !on;
  if (!on) return;
  const pct = Math.round((monthUsd / limit) * 100);
  const warn = pct >= 80;
  budgetBar.value = Math.min(1, monthUsd / limit);
  budgetBar.classList.toggle('warn', warn);
  const over = budgetError(monthUsd, limit);
  budgetStatus.textContent = over
    ? 'Đã chạm giới hạn: tạm ngừng dịch mới (bản đã dịch vẫn xem được).'
    : `${pct}% của $${limit}${warn ? ' — sắp chạm giới hạn' : ''}`;
  budgetStatus.className = `status ${warn ? 'err' : ''}`;
}

async function testKey() {
  setStatus('Đang kiểm tra…');
  const res = await sendToBackground<TestKeyResponse>({ type: 'test_key' });
  if (res.ok) setStatus('✓ Key hợp lệ (kiểm tra miễn phí, không tốn token).', 'ok');
  else setStatus(res.message, 'err');
}

void init();
