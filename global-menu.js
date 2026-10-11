// Mute Tab - global command palette and its two-step page hotkey.
// This runs in every frame so the chord still works while an iframe has focus;
// only the top frame renders the palette.

(() => {
  const CHORD_TIMEOUT = 1800;
  const defaultCombo = (code, label) => ({
    key: label.toLowerCase(), code, label,
    ctrl: true, alt: false, shift: false, meta: false
  });
  const DEFAULT_MENU_HOTKEY = {
    first: defaultCombo('KeyM', 'M'),
    second: defaultCombo('KeyK', 'K')
  };

  let menuHotkey = DEFAULT_MENU_HOTKEY;
  let waitingUntil = 0;

  chrome.storage.sync.get({ menuHotkey: DEFAULT_MENU_HOTKEY }, (items) => {
    menuHotkey = items.menuHotkey;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.menuHotkey) menuHotkey = changes.menuHotkey.newValue;
  });

  function matchesCombo(event, combo) {
    if (!combo) return false;
    if (event.ctrlKey !== Boolean(combo.ctrl)) return false;
    if (event.altKey !== Boolean(combo.alt)) return false;
    if (event.shiftKey !== Boolean(combo.shift)) return false;
    if (event.metaKey !== Boolean(combo.meta)) return false;
    if (combo.code && event.code) return event.code === combo.code;
    return String(event.key).toLowerCase() === String(combo.key).toLowerCase();
  }

  document.addEventListener('keydown', (event) => {
    if (event.repeat || !menuHotkey || !menuHotkey.first || !menuHotkey.second) return;
    if (['Control', 'Alt', 'Shift', 'Meta', 'CapsLock'].includes(event.key)) return;
    const now = Date.now();
    if (waitingUntil > now && matchesCombo(event, menuHotkey.second)) {
      waitingUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (window === window.top) open();
      else chrome.runtime.sendMessage({ type: 'open-global-menu' }).catch(() => {});
      return;
    }
    waitingUntil = 0;
    if (!matchesCombo(event, menuHotkey.first)) return;
    waitingUntil = now + CHORD_TIMEOUT;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  if (window !== window.top) return;

  let host = null;
  let ui = null;
  let state = null;
  let selectedIndex = 0;

  const SPEAKER =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 9.6h3.84L13.92 4.32v15.36L8.64 14.4H4.8z"/>' +
    '<path class="wave" d="M14.95 7.18a7.2 7.2 0 0 1 0 9.64"/></svg>';

  function build() {
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.58); backdrop-filter: blur(2px); }
        .palette {
          position: fixed; top: min(16vh, 130px); left: 50%; transform: translateX(-50%);
          width: min(560px, calc(100vw - 32px)); max-height: min(620px, calc(100vh - 64px));
          display: flex; flex-direction: column; overflow: hidden;
          background: #111318; color: #eef0f2; border: 1px solid #34383f; border-radius: 16px;
          box-shadow: 0 24px 80px rgba(0,0,0,.62);
          font: 14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;
        }
        .top { display: flex; align-items: center; gap: 11px; padding: 14px 15px; border-bottom: 1px solid #292d33; }
        .top svg { width: 21px; height: 21px; flex: none; fill: currentColor; color: #ef4444; }
        .top .wave { fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round; }
        input {
          min-width: 0; flex: 1; padding: 0; background: transparent; border: 0; outline: 0;
          color: #fff; caret-color: #ef4444; font: 500 16px/1.4 inherit;
        }
        input::placeholder { color: #797f89; }
        .close { padding: 3px 7px; background: #22262c; border: 1px solid #343941; border-radius: 6px; color:#9da3ad; font:11px/1.3 inherit; cursor:pointer; }
        .scroll { min-height: 0; padding: 8px; overflow-y: auto; }
        .section { padding: 7px 10px 5px; color:#747b86; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
        .option {
          width:100%; display:flex; align-items:center; gap:12px; padding:10px 11px;
          background:transparent; border:0; border-radius:9px; color:inherit; text-align:left; cursor:pointer;
          font:inherit;
        }
        .option:hover, .option.selected { background:#252930; }
        .option .glyph { width:28px; height:28px; display:grid; place-items:center; flex:none; border-radius:8px; background:#1d2026; color:#ef4444; font-weight:800; }
        .option .copy { min-width:0; flex:1; display:flex; flex-direction:column; }
        .option strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
        .option small { color:#818792; font-size:11px; }
        .option .count { color:#777e88; font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
        .empty { margin:10px; padding:22px 10px; color:#808690; text-align:center; }
        .footer { display:flex; justify-content:space-between; gap:10px; padding:9px 14px; border-top:1px solid #292d33; color:#747b86; font-size:11px; }
        .toast { color:#b7bdc7; }
        [hidden] { display:none !important; }
        @media (prefers-reduced-motion:no-preference) { .palette { animation:in .12s ease-out; } @keyframes in { from { opacity:0; transform:translate(-50%,-8px) scale(.985); } } }
      </style>
      <div class="backdrop"></div>
      <section class="palette" role="dialog" aria-modal="true" aria-label="Global mute menu">
        <div class="top">${SPEAKER}<input type="search" autocomplete="off" spellcheck="false" placeholder="Search open sites, like facebook…" aria-label="Search open tabs"><button class="close" type="button">ESC</button></div>
        <div class="scroll"><div class="actions"></div><div class="sites"></div><div class="empty" hidden>No matching open tabs</div></div>
        <div class="footer"><span>↑↓ select · Enter run</span><span class="toast">Loading open tabs…</span></div>
      </section>`;
    ui = {
      shadow,
      backdrop: shadow.querySelector('.backdrop'),
      palette: shadow.querySelector('.palette'),
      input: shadow.querySelector('input'),
      close: shadow.querySelector('.close'),
      actions: shadow.querySelector('.actions'),
      sites: shadow.querySelector('.sites'),
      empty: shadow.querySelector('.empty'),
      toast: shadow.querySelector('.toast')
    };
    ui.backdrop.addEventListener('click', close);
    ui.close.addEventListener('click', close);
    ui.input.addEventListener('input', () => { selectedIndex = 0; render(); });
    ui.shadow.addEventListener('click', (event) => {
      const option = event.target.closest('.option');
      if (option) run(option.dataset.action, option.dataset.value || '');
    });
    ui.shadow.addEventListener('keydown', onKeydown);
  }

  function option(action, label, detail, glyph, count, value = '') {
    return `<button class="option" type="button" data-action="${action}" data-value="${escapeHtml(value)}"><span class="glyph">${glyph}</span><span class="copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>${count ? `<span class="count">${escapeHtml(count)}</span>` : ''}</button>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
  }

  function render() {
    if (!ui || !state) return;
    const query = ui.input.value.trim().toLowerCase();
    const current = state.current;
    let actions = '';
    if (!query) {
      actions += '<div class="section">Quick actions</div>';
      actions += option('toggle-current', current && current.muted ? 'Unmute current tab' : 'Mute current tab', current && current.host ? current.host : 'Active tab', current && current.muted ? '♪' : '×');
      actions += option('mute-audible', 'Mute every audible tab', 'Silence tabs currently producing audio', '×', `${state.audibleTabs} audible`);
      actions += option('unmute-all', 'Unmute all tabs', 'Restore sound everywhere', '♪', `${state.mutedTabs} muted`);
    } else {
      const matching = state.sites.filter((site) => site.host.includes(query));
      const matchingCount = matching.reduce((sum, site) => sum + site.count, 0);
      actions += '<div class="section">Matching tabs</div>';
      actions += option('mute-matching', `Mute everything matching “${query}”`, 'Matches site names and tab titles', '×', `${matchingCount} site tabs`, query);
      actions += option('unmute-matching', `Unmute everything matching “${query}”`, 'Matches site names and tab titles', '♪', '', query);
    }
    ui.actions.innerHTML = actions;

    const visibleSites = state.sites.filter((site) => !query || site.host.includes(query)).slice(0, 18);
    ui.sites.innerHTML = visibleSites.length ? '<div class="section">Open sites</div>' + visibleSites.map((site) => {
      const allMuted = site.muted === site.count;
      return option(allMuted ? 'unmute-site' : 'mute-site', `${allMuted ? 'Unmute' : 'Mute'} all ${site.host} tabs`, `${site.muted} muted · ${site.audible} audible`, allMuted ? '♪' : '×', `${site.count} tab${site.count === 1 ? '' : 's'}`, site.host);
    }).join('') : '';
    ui.empty.hidden = Boolean(visibleSites.length || !query);
    select(selectedIndex);
  }

  function options() {
    return [...ui.shadow.querySelectorAll('.option')];
  }

  function select(index) {
    const items = options();
    if (!items.length) return;
    selectedIndex = Math.max(0, Math.min(index, items.length - 1));
    items.forEach((item, itemIndex) => item.classList.toggle('selected', itemIndex === selectedIndex));
    items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); select(selectedIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); select(selectedIndex - 1); }
    else if (event.key === 'Enter') {
      const item = options()[selectedIndex];
      if (item) { event.preventDefault(); item.click(); }
    }
  }

  async function run(action, value) {
    ui.toast.textContent = 'Working…';
    const result = await chrome.runtime.sendMessage({ type: 'run-global-action', action, value }).catch(() => null);
    if (!result || result.error) {
      ui.toast.textContent = result && result.error ? result.error : 'Could not update tabs';
      return;
    }
    state = result.state;
    ui.toast.textContent = `${result.changed} tab${result.changed === 1 ? '' : 's'} updated`;
    render();
  }

  async function open() {
    if (host && host.isConnected) {
      ui.input.focus();
      return;
    }
    if (!host) build();
    (document.body || document.documentElement).appendChild(host);
    selectedIndex = 0;
    ui.input.value = '';
    ui.toast.textContent = 'Loading open tabs…';
    ui.input.focus();
    state = await chrome.runtime.sendMessage({ type: 'get-global-menu-state' }).catch(() => null);
    if (!state) { ui.toast.textContent = 'Could not read open tabs'; return; }
    ui.toast.textContent = `${state.totalTabs} open · ${state.audibleTabs} audible · ${state.mutedTabs} muted`;
    render();
  }

  function close() {
    if (host) host.remove();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'show-global-menu') {
      open();
      sendResponse({ handled: true });
    }
  });
})();
