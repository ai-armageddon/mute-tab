// Mute Tab - popup: current tab state, custom hotkey recorder, browser shortcut.

const IS_MAC = navigator.userAgent.includes('Mac');
const DEFAULT_HINT = 'Works on normal web pages. Needs Ctrl, Alt or Cmd.';
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'CapsLock']);
const MENU_HINT = 'Press the first combo, release it, then press the second.';

function defaultCombo(code, label) {
  return { key: label.toLowerCase(), code, label, ctrl: true, alt: false, shift: false, meta: false };
}

const DEFAULT_MENU_HOTKEY = {
  first: defaultCombo('KeyM', 'M'),
  second: defaultCombo('KeyK', 'K')
};

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
  menuCommandKeys: document.getElementById('menuCommandKeys'),
  openShortcuts: document.getElementById('openShortcuts'),
  alertEnabled: document.getElementById('alertEnabled'),
  cornerEnabled: document.getElementById('cornerEnabled'),
  menuRecord: document.getElementById('menuRecord'),
  menuReset: document.getElementById('menuReset'),
  menuHint: document.getElementById('menuHint'),
  globalStats: document.getElementById('globalStats'),
  siteSearch: document.getElementById('siteSearch'),
  siteResults: document.getElementById('siteResults'),
  globalFeedback: document.getElementById('globalFeedback')
};

let activeTab = null;
let hotkey = null;
let recording = false;
let menuHotkey = DEFAULT_MENU_HOTKEY;
let menuRecordingStep = 0;
let pendingMenuCombo = null;
let globalState = null;

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

function formatMenuHotkey(value) {
  if (!value || !value.first || !value.second) return 'Disabled';
  return `${formatHotkey(value.first)} then ${formatHotkey(value.second)}`;
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

function renderMenuHotkey() {
  els.menuRecord.textContent = formatMenuHotkey(menuHotkey);
}

function stopMenuRecording(message = MENU_HINT) {
  menuRecordingStep = 0;
  pendingMenuCombo = null;
  els.menuRecord.classList.remove('is-recording');
  els.menuHint.textContent = message;
  els.menuHint.classList.remove('is-error');
  renderMenuHotkey();
}

function recordedCombo(event) {
  return {
    key: event.key,
    code: event.code,
    label: labelFor(event),
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
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
  if (menuRecordingStep) stopMenuRecording();
  if (recording) stopRecording();
  else startRecording();
});

els.menuRecord.addEventListener('click', () => {
  if (recording) stopRecording();
  if (menuRecordingStep) {
    stopMenuRecording();
    return;
  }
  menuRecordingStep = 1;
  els.menuRecord.classList.add('is-recording');
  els.menuRecord.textContent = 'Press first combo…';
  els.menuHint.textContent = 'Step 1 of 2 · Esc cancels';
});

els.menuReset.addEventListener('click', async () => {
  menuHotkey = DEFAULT_MENU_HOTKEY;
  await chrome.storage.sync.set({ menuHotkey });
  stopMenuRecording('Reset to the default two-step chord.');
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
  if (!recording && !menuRecordingStep) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    if (recording) {
      stopRecording();
      setHint(DEFAULT_HINT);
    } else {
      stopMenuRecording();
    }
    return;
  }
  if (MODIFIER_KEYS.has(event.key)) return;
  // A bare key (or Shift + key) would fire while typing on a page.
  if (!event.ctrlKey && !event.altKey && !event.metaKey) {
    const message = 'Include Ctrl, Alt or Cmd so the hotkey does not collide with typing.';
    if (recording) setHint(message, true);
    else {
      els.menuHint.textContent = message;
      els.menuHint.classList.add('is-error');
    }
    return;
  }
  if (menuRecordingStep && IS_MAC && event.metaKey && event.code === 'KeyM') {
    els.menuHint.textContent = 'macOS reserves Cmd+M for Minimize. Choose a different combo.';
    els.menuHint.classList.add('is-error');
    return;
  }
  if (recording) {
    hotkey = recordedCombo(event);
    await chrome.storage.sync.set({ hotkey });
    stopRecording();
    setHint('Saved. Tabs opened before installing need a reload.');
  } else if (menuRecordingStep === 1) {
    pendingMenuCombo = recordedCombo(event);
    menuRecordingStep = 2;
    els.menuRecord.textContent = `${formatHotkey(pendingMenuCombo)} then …`;
    els.menuHint.textContent = 'Step 2 of 2 · press the second combo';
    els.menuHint.classList.remove('is-error');
  } else {
    menuHotkey = { first: pendingMenuCombo, second: recordedCombo(event) };
    await chrome.storage.sync.set({ menuHotkey });
    stopMenuRecording('Saved. The second combo must follow within 1.8 seconds.');
  }
}, true);

function makeSiteButton(site) {
  const allMuted = site.muted === site.count;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'site-action';
  button.dataset.globalAction = allMuted ? 'unmute-site' : 'mute-site';
  button.dataset.value = site.host;
  const label = document.createElement('span');
  label.textContent = `${allMuted ? 'Unmute' : 'Mute'} ${site.host}`;
  const count = document.createElement('small');
  count.textContent = `${site.count} tab${site.count === 1 ? '' : 's'}`;
  button.append(label, count);
  return button;
}

function renderGlobalState() {
  if (!globalState) return;
  els.globalStats.textContent = `${globalState.totalTabs} open · ${globalState.audibleTabs} audible · ${globalState.mutedTabs} muted`;
  const query = els.siteSearch.value.trim().toLowerCase();
  els.siteResults.replaceChildren();
  if (query) {
    const matching = globalState.sites.filter((site) => site.host.includes(query));
    const count = matching.reduce((sum, site) => sum + site.count, 0);
    for (const action of ['mute-matching', 'unmute-matching']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-action';
      button.dataset.globalAction = action;
      button.dataset.value = query;
      button.textContent = `${action.startsWith('mute-') ? 'Mute' : 'Unmute'} all “${query}” matches (${count})`;
      els.siteResults.appendChild(button);
    }
  }
  for (const site of globalState.sites.filter((site) => !query || site.host.includes(query)).slice(0, 6)) {
    els.siteResults.appendChild(makeSiteButton(site));
  }
}

async function runGlobalAction(action, value = '') {
  els.globalFeedback.textContent = 'Working…';
  const result = await chrome.runtime.sendMessage({ type: 'run-global-action', action, value });
  if (!result || result.error) {
    els.globalFeedback.textContent = result && result.error ? result.error : 'Could not update tabs.';
    return;
  }
  globalState = result.state;
  els.globalFeedback.textContent = `${result.changed} tab${result.changed === 1 ? '' : 's'} updated.`;
  renderGlobalState();
  await refreshTab();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-global-action]');
  if (button) runGlobalAction(button.dataset.globalAction, button.dataset.value || '');
});

els.siteSearch.addEventListener('input', renderGlobalState);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  renderTab();

  const stored = await chrome.storage.sync.get({
    hotkey: null,
    menuHotkey: DEFAULT_MENU_HOTKEY,
    muteAlert: true,
    muteCorner: true
  });
  hotkey = stored.hotkey;
  menuHotkey = stored.menuHotkey;
  renderHotkey();
  renderMenuHotkey();
  setHint(DEFAULT_HINT);
  els.alertEnabled.checked = stored.muteAlert;
  els.cornerEnabled.checked = stored.muteCorner;
  renderAlertSettings();

  const commands = await chrome.commands.getAll();
  const command = commands.find((entry) => entry.name === 'toggle-mute');
  const shortcut = command && command.shortcut;
  els.commandKeys.textContent = shortcut || 'Not set';
  els.commandKeys.classList.toggle('is-unset', !shortcut);
  const menuCommand = commands.find((entry) => entry.name === 'open-global-menu');
  const menuShortcut = menuCommand && menuCommand.shortcut;
  els.menuCommandKeys.textContent = menuShortcut || 'Not set';
  els.menuCommandKeys.classList.toggle('is-unset', !menuShortcut);

  globalState = await chrome.runtime.sendMessage({ type: 'get-global-menu-state' });
  renderGlobalState();
}

init();
