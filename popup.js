// Mute Tab - popup: current tab state, custom hotkey recorder, browser shortcut.

const IS_MAC = navigator.userAgent.includes('Mac');
const DEFAULT_HINT = 'Works on normal web pages. Needs Ctrl, Alt or Cmd.';
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'CapsLock']);

const CODE_LABELS = {
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab',
  Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Minus: '-', Equal: '=', Backquote: '`'
};

const els = {
  toggle: document.getElementById('toggle'),
  state: document.getElementById('toggleState'),
  host: document.getElementById('toggleHost'),
  record: document.getElementById('record'),
  clear: document.getElementById('clear'),
  hint: document.getElementById('recordHint'),
  commandKeys: document.getElementById('commandKeys'),
  openShortcuts: document.getElementById('openShortcuts'),
  alertEnabled: document.getElementById('alertEnabled'),
  cornerEnabled: document.getElementById('cornerEnabled')
};

let activeTab = null;
let hotkey = null;
let recording = false;

function labelFor(event) {
  const code = event.code || '';
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return 'Num' + numpad[1];
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (/^F\d{1,2}$/.test(code)) return code;
  const key = event.key || '';
  return key.length === 1 ? key.toUpperCase() : key;
}

function formatHotkey(hk) {
  if (!hk) return '';
  const parts = [];
  if (IS_MAC) {
    if (hk.ctrl) parts.push('\u2303');
    if (hk.alt) parts.push('\u2325');
    if (hk.shift) parts.push('\u21e7');
    if (hk.meta) parts.push('\u2318');
    return parts.join('') + (hk.label || '');
  }
  if (hk.ctrl) parts.push('Ctrl');
  if (hk.alt) parts.push('Alt');
  if (hk.shift) parts.push('Shift');
  if (hk.meta) parts.push('Win');
  parts.push(hk.label || '');
  return parts.join(' + ');
}

function hostOf(tab) {
  if (!tab || !tab.url) return '';
  try {
    return new URL(tab.url).hostname || tab.url;
  } catch {
    return '';
  }
}

function setHint(text, isError) {
  els.hint.textContent = text;
  els.hint.classList.toggle('is-error', Boolean(isError));
}

function renderTab() {
  const muted = Boolean(activeTab && activeTab.mutedInfo && activeTab.mutedInfo.muted);
  els.toggle.classList.toggle('is-muted', muted);
  if (!activeTab) els.state.textContent = 'No tab';
  else if (muted) els.state.textContent = 'Muted';
  else els.state.textContent = activeTab.audible ? 'Playing sound' : 'Not muted';
  els.host.textContent = hostOf(activeTab);
}

function renderHotkey() {
  els.record.textContent = hotkey ? formatHotkey(hotkey) : 'Click to record';
  els.clear.hidden = !hotkey;
}

function startRecording() {
  recording = true;
  els.record.classList.add('is-recording');
  els.record.textContent = 'Press keys\u2026';
  setHint('Listening. Press Esc to cancel.');
}

function stopRecording() {
  recording = false;
  els.record.classList.remove('is-recording');
  renderHotkey();
}

async function refreshTab() {
  if (!activeTab) return;
  activeTab = await chrome.tabs.get(activeTab.id);
  renderTab();
}

els.toggle.addEventListener('click', async () => {
  if (!activeTab) return;
  await chrome.runtime.sendMessage({ type: 'toggle-mute', tabId: activeTab.id });
  await refreshTab();
});

els.record.addEventListener('click', () => {
  if (recording) stopRecording();
  else startRecording();
});

els.clear.addEventListener('click', async () => {
  hotkey = null;
  await chrome.storage.sync.set({ hotkey: null });
  renderHotkey();
  setHint(DEFAULT_HINT);
});

// The corner icon only ever appears after the alert, so it is moot while the
// alert itself is off.
function renderAlertSettings() {
  els.cornerEnabled.disabled = !els.alertEnabled.checked;
}

els.alertEnabled.addEventListener('change', async () => {
  renderAlertSettings();
  await chrome.storage.sync.set({ muteAlert: els.alertEnabled.checked });
});

els.cornerEnabled.addEventListener('change', async () => {
  await chrome.storage.sync.set({ muteCorner: els.cornerEnabled.checked });
});

els.openShortcuts.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  window.close();
});

window.addEventListener('keydown', async (event) => {
  if (!recording) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    stopRecording();
    setHint(DEFAULT_HINT);
    return;
  }
  if (MODIFIER_KEYS.has(event.key)) return;
  // A bare key (or Shift + key) would fire while typing on a page.
  if (!event.ctrlKey && !event.altKey && !event.metaKey) {
    setHint('Include Ctrl, Alt or Cmd so the hotkey does not collide with typing.', true);
    return;
  }
  hotkey = {
    key: event.key,
    code: event.code,
    label: labelFor(event),
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
  await chrome.storage.sync.set({ hotkey });
  stopRecording();
  setHint('Saved. Tabs opened before installing need a reload.');
}, true);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  renderTab();

  const stored = await chrome.storage.sync.get({
    hotkey: null,
    muteAlert: true,
    muteCorner: true
  });
  hotkey = stored.hotkey;
  renderHotkey();
  setHint(DEFAULT_HINT);
  els.alertEnabled.checked = stored.muteAlert;
  els.cornerEnabled.checked = stored.muteCorner;
  renderAlertSettings();

  const commands = await chrome.commands.getAll();
  const command = commands.find((entry) => entry.name === 'toggle-mute');
  const shortcut = command && command.shortcut;
  els.commandKeys.textContent = shortcut || 'Not set';
  els.commandKeys.classList.toggle('is-unset', !shortcut);
}

init();
