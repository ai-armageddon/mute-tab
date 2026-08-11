// Mute Tab - in-page hotkey listener.
// Handles the user-recorded shortcut. The Chrome command in manifest.json
// covers pages this cannot reach (chrome:// pages, the PDF viewer, etc).

let hotkey = null;

chrome.storage.sync.get({ hotkey: null }, (items) => {
  hotkey = items.hotkey;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.hotkey) hotkey = changes.hotkey.newValue;
});

function matchesHotkey(event) {
  if (!hotkey) return false;
  if (event.ctrlKey !== Boolean(hotkey.ctrl)) return false;
  if (event.altKey !== Boolean(hotkey.alt)) return false;
  if (event.shiftKey !== Boolean(hotkey.shift)) return false;
  if (event.metaKey !== Boolean(hotkey.meta)) return false;
  // Compare physical keys so Option-modified characters on macOS still match.
  if (hotkey.code && event.code) return event.code === hotkey.code;
  return String(event.key).toLowerCase() === String(hotkey.key).toLowerCase();
}

// ---------------------------------------------------------------------------
// Muted-audio alert. The service worker reports when this tab is muted but
// still trying to play sound; the top frame tints the window and flashes a red
// mute icon. Dismissing collapses it to a small corner badge, and both layers
// can be turned off from the popup's settings.

if (window === window.top) {
  const alertState = {
    settings: { muteAlert: true, muteCorner: true },
    active: false,
    dismissed: false
  };

  let alertHost = null;
  let alertUi = null;

  const MUTE_ICON_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="speaker" d="M4.8 9.6h3.84L13.92 4.32v15.36L8.64 14.4H4.8z"/>' +
    '<path class="slash" d="M8.16 1.44 17.76 22.56"/>' +
    '</svg>';

  function buildAlertUi() {
    alertHost = document.createElement('div');
    // The host stays inert; the shadow tree opts back into pointer events.
    alertHost.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = alertHost.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        svg { display: block; width: 100%; height: 100%; }
        .speaker { fill: currentColor; }
        .slash { fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
        .tint {
          position: fixed; inset: 0;
          background: rgba(239, 68, 68, 0.14);
          animation: mt-tint 1.2s ease-in-out infinite;
        }
        .banner {
          position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px;
          background: #16181c; color: #e7e9ea;
          border: 1px solid #ef4444; border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
          pointer-events: auto;
        }
        .banner .icon {
          width: 26px; height: 26px; flex: none;
          color: #ef4444;
          animation: mt-flash 1.2s step-end infinite;
        }
        .banner strong { font-size: 13px; display: block; }
        .banner small { color: #9aa0a6; font-size: 12px; display: block; }
        .banner button {
          flex: none;
          padding: 6px 10px;
          border-radius: 8px;
          font: 600 12px/1 system-ui, -apple-system, 'Segoe UI', sans-serif;
          cursor: pointer;
        }
        .unmute { background: #ef4444; border: 1px solid #ef4444; color: #fff; }
        .unmute:hover { background: #dc2626; }
        .dismiss { background: none; border: 1px solid #2f3336; color: #e7e9ea; }
        .dismiss:hover { border-color: #4b5259; }
        .corner {
          position: fixed; top: 12px; right: 12px;
          width: 34px; height: 34px; padding: 7px;
          background: #ef4444; color: #fff;
          border: 0; border-radius: 50%;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
          cursor: pointer;
          pointer-events: auto;
          animation: mt-flash 1.2s step-end infinite;
        }
        .corner:hover { animation: none; background: #dc2626; }
        [hidden] { display: none !important; }
        @keyframes mt-flash { 50% { opacity: 0.25; } }
        @keyframes mt-tint { 50% { opacity: 0.45; } }
        @media (prefers-reduced-motion: reduce) {
          .tint, .banner .icon, .corner { animation: none; }
        }
      </style>
      <div class="tint" hidden></div>
      <div class="banner" hidden>
        <div class="icon">${MUTE_ICON_SVG}</div>
        <div>
          <strong>This tab is muted</strong>
          <small>Audio is playing but you can't hear it.</small>
        </div>
        <button class="unmute" type="button">Unmute</button>
        <button class="dismiss" type="button">Dismiss</button>
      </div>
      <button class="corner" type="button" hidden
              title="This muted tab is playing audio. Click to unmute.">${MUTE_ICON_SVG}</button>
    `;
    alertUi = {
      tint: shadow.querySelector('.tint'),
      banner: shadow.querySelector('.banner'),
      corner: shadow.querySelector('.corner')
    };
    const unmute = () => {
      chrome.runtime.sendMessage({ type: 'toggle-mute' }).catch(() => {});
    };
    shadow.querySelector('.unmute').addEventListener('click', unmute);
    alertUi.corner.addEventListener('click', unmute);
    shadow.querySelector('.dismiss').addEventListener('click', () => {
      alertState.dismissed = true;
      renderAlert();
    });
  }

  function renderAlert() {
    const show = alertState.active && alertState.settings.muteAlert;
    if (!show) {
      // Reset so the full alert returns the next time muted audio starts.
      alertState.dismissed = false;
      if (alertHost) alertHost.remove();
      return;
    }
    if (!alertHost) buildAlertUi();
    if (!alertHost.isConnected) {
      (document.body || document.documentElement).appendChild(alertHost);
    }
    const full = !alertState.dismissed;
    alertUi.tint.hidden = !full;
    alertUi.banner.hidden = !full;
    alertUi.corner.hidden = full || !alertState.settings.muteCorner;
  }

  chrome.storage.sync.get(alertState.settings, (items) => {
    alertState.settings = items;
    renderAlert();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.muteAlert) alertState.settings.muteAlert = changes.muteAlert.newValue;
    if (changes.muteCorner) alertState.settings.muteCorner = changes.muteCorner.newValue;
    if (changes.muteAlert || changes.muteCorner) renderAlert();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'muted-audio-state') return;
    if (message.active === alertState.active) return;
    alertState.active = message.active;
    if (!message.active) alertState.dismissed = false;
    renderAlert();
  });

  // Catch the state this page missed while it was still loading.
  chrome.runtime
    .sendMessage({ type: 'get-muted-audio-state' })
    .then((reply) => {
      if (reply && reply.active) {
        alertState.active = true;
        renderAlert();
      }
    })
    .catch(() => {});
}

// Capture phase so pages that swallow keydown events cannot block the hotkey.
// Text fields are deliberately not excluded: Chrome's own command shortcuts fire
// while typing, the popup requires a Ctrl/Alt/Cmd modifier, and preventDefault
// stops the combination from inserting a character.
document.addEventListener('keydown', (event) => {
  if (event.repeat || !matchesHotkey(event)) return;
  event.preventDefault();
  event.stopPropagation();
  chrome.runtime.sendMessage({ type: 'toggle-mute' }).catch(() => {
    // The extension was reloaded and this script is orphaned.
  });
}, true);
