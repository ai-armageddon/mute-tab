<h1 align="center">
  <img src="icons/icon128.png" width="88" alt="Mute Tab icon"><br>
  Mute Tab
</h1>

<p align="center">
  <b>Silence one tab—or every matching open tab—from the keyboard.</b><br>
  Press <kbd>Ctrl+M</kbd>, then <kbd>Ctrl+K</kbd> to open the global menu.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-000000">
  <img alt="Permissions" src="https://img.shields.io/badge/permissions-storage%20%2B%20tabs-2ea44f">
</p>

---

## In action

<p align="center">
  <img src="screenshots/alert-banner.png" width="49%" alt="A muted tab that is still playing audio: the page gets a red tint and a flashing banner with Unmute and Dismiss buttons">
  <img src="screenshots/alert-corner.png" width="49%" alt="After dismissing the banner, a small flashing corner icon remains in the top-right corner">
</p>
<p align="center">
  <sub>A muted tab starts playing sound: the page tints red and a flashing banner offers <b>Unmute</b> and
  <b>Dismiss</b> — dismissed, it collapses to a small corner icon (click it to unmute).</sub>
</p>

<p align="center">
  <img src="screenshots/popup.png" width="32%" alt="The popup: tab status, custom hotkey recorder, muted audio alert settings, and browser shortcut">
  <img src="screenshots/popup-recording.png" width="32%" alt="The popup while recording a custom hotkey">
  <img src="screenshots/popup-muted.png" width="32%" alt="The popup with the tab muted and a custom hotkey recorded">
</p>
<p align="center">
  <sub>The popup: current tab state, hotkey recorder (idle · recording · recorded), the muted-audio
  alert toggles, and the browser shortcut.</sub>
</p>

## Why

Chrome can mute a tab, but only by right-clicking it. That is a poor fit for the
one case where it matters — an ad or autoplay video starting mid-sentence. This
makes it a keystroke, and mutes at the browser level so it catches *everything*
in the tab: `<video>`, `<audio>`, Web Audio, and audio inside cross-origin iframes.

## Global menu

The command palette works from any regular web tab. Its default two-step chord
is <kbd>Ctrl+M</kbd>, then <kbd>Ctrl+K</kbd>. Open the extension popup to record
any other two combinations. On macOS this deliberately uses Control: the system
reserves <kbd>⌘M</kbd> for Minimize, so Chrome never passes that combination to
an extension.

From the menu you can:

- mute or unmute the current tab;
- mute every tab that is currently audible;
- unmute every open tab;
- mute or unmute every tab from one site; or
- type a term such as `facebook` and mute every open tab whose site or title
  matches it.

Use the arrow keys and Enter to run an action, or click one. The sequence must be
completed within 1.8 seconds. Chrome's browser shortcut for the menu defaults to
<kbd>Alt+Shift+K</kbd>; it opens the toolbar popup as a fallback on protected
pages such as `chrome://` pages, where Chrome does not permit an in-page menu.

## Three shortcuts, on purpose

| | Quick browser mute | Quick page mute | Global menu chord |
| --- | --- | --- | --- |
| Default | <kbd>Alt+Shift+M</kbd> | none | <kbd>Ctrl+M</kbd>, then <kbd>Ctrl+K</kbd> |
| Set from | `chrome://extensions/shortcuts` | extension popup | extension popup |
| Works on protected pages | yes | no | use the <kbd>Alt+Shift+K</kbd> browser fallback |
| Needs page focus | no | yes | yes |

Chrome only supports one key combination per browser command, not two-step
chords. Browser shortcuts can only be rebound on Chrome's own shortcuts page—the
popup has a **Change** button that opens it. The two page-level shortcuts are
recorded in the popup and handled by content scripts, which is why protected
pages use the single-combination browser fallback.

Every route calls the same service-worker logic, so the toolbar badge stays in
sync no matter which one you use.

## How it behaves

- **Mutes at the tab level.** Uses `chrome.tabs.update({ muted })` rather than
  hunting for media elements, so nothing in the tab can slip through.
- **Shows state in the toolbar.** The red slashed-speaker icon picks up an `OFF`
  badge on muted tabs. Chrome resets per-tab badges on navigation, so it is
  repainted whenever a tab finishes loading.
- **Fires even while you're typing.** Chrome's command shortcuts work with focus
  in a text field, and the custom hotkey matches that. It is also why a Ctrl, Alt,
  or Cmd modifier is required, and why the keystroke is swallowed so it cannot
  insert a stray character.
- **Wins against pages that hijack keys.** The key handler runs in the capture
  phase and in every frame, so it fires before page-level handlers.
- **Survives navigation and restarts.** Mute state lives on the tab itself, so
  there is nothing to persist and nothing to get out of sync.
- **Groups open tabs by site.** The `tabs` permission lets the global menu read
  open tab URLs and titles locally so it can find matching tabs. Nothing is sent
  anywhere.
- **Warns when a muted tab plays sound.** Chrome keeps a tab's `audible` flag on
  while a muted tab is still trying to play, so the page gets a red tint and a
  flashing mute banner with **Unmute** and **Dismiss** buttons. Dismissing
  collapses it to a small flashing icon in the top-right corner (click it to
  unmute). Both the alert and the corner icon can be turned off in the popup.

Muting is manual only—nothing is auto-muted and no per-site rules are stored.

## Install

1. Clone or download this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the project folder
5. Reload any tabs you had open, so the custom hotkey works there too

The browser shortcuts are active immediately. To record a page hotkey, click the
toolbar icon, click its hotkey field, and press your combination. Every step must
include Ctrl, Alt, or Cmd so it cannot collide with normal typing.

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest—the two browser commands, content scripts, and `storage` + `tabs` permissions |
| `background.js` | Service worker: single-tab and bulk mute logic, site matching, toolbar state, and command routing |
| `content.js` | Listens for the recorded hotkey and draws the muted-audio alert |
| `global-menu.js` | Listens for the two-step chord and draws the searchable in-page command palette |
| `popup.html` / `popup.css` / `popup.js` | Mute controls, hotkey recorders, site search, alert settings, and browser shortcuts |
| `icons/*.png` | Red muted-speaker icon at 16 / 32 / 48 / 128 |
| `tools/make_icons.py` | Renders the icon PNGs |
| `screenshots/*.png` | The images in this README |

Regenerate the icons after editing the geometry constants in the script:

```bash
python3 tools/make_icons.py
```

It draws the glyph into a supersampled buffer and writes the PNGs directly, so it
needs only the Python standard library. The slash is deliberately steep — a 45°
slash runs parallel to the speaker cone's edges and dissolves the silhouette at
16 px.

## A note on the permission warning

Chrome will warn that this extension can "read and change all your data on all
websites." That comes from the `<all_urls>` content scripts, which listen for
recorded key combinations and draw the mute UI—they make no network calls. The
`tabs` permission also lets the menu read open tab URLs and titles for local
matching.

## Compatibility

Chrome and other Chromium browsers (Edge, Brave, Arc) with Manifest V3 support.

## License

MIT
