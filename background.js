// Mute Tab - service worker.
// Owns the muting itself plus the per-tab toolbar icon, so the popup, the
// Chrome command and the in-page hotkey all funnel through the same code.

const ICON_ON = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};

const ICON_MUTED = {
  16: 'icons/muted16.png',
  32: 'icons/muted32.png',
  48: 'icons/muted48.png',
  128: 'icons/muted128.png'
};

function isMuted(tab) {
  return Boolean(tab && tab.mutedInfo && tab.mutedInfo.muted);
}

// Chrome keeps `audible` true while a muted tab is still trying to play sound,
// which is exactly the state the in-page alert warns about.
function isMutedAudible(tab) {
  return isMuted(tab) && Boolean(tab && tab.audible);
}

function notifyMutedAudible(tab) {
  if (!tab || typeof tab.id !== 'number' || tab.id === chrome.tabs.TAB_ID_NONE) return;
  chrome.tabs
    .sendMessage(tab.id, { type: 'muted-audio-state', active: isMutedAudible(tab) })
    .catch(() => {
      // No content script in this tab (chrome:// page, not yet loaded, etc).
    });
}

// Chrome resets per-tab action state on navigation, so this gets called again
// whenever a tab finishes loading.
async function paint(tab) {
  if (!tab || typeof tab.id !== 'number' || tab.id === chrome.tabs.TAB_ID_NONE) return;
  const muted = isMuted(tab);
  try {
    await chrome.action.setIcon({ tabId: tab.id, path: muted ? ICON_MUTED : ICON_ON });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: muted ? 'Mute Tab \u2014 this tab is muted' : 'Mute Tab \u2014 this tab is not muted'
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: muted ? 'OFF' : '' });
  } catch {
    // The tab was closed or discarded before we could paint it.
  }
}

async function toggleMuted(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const muted = !isMuted(tab);
  await chrome.tabs.update(tabId, { muted });
  return muted;
}

async function toggleActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) await toggleMuted(tab.id);
}

async function paintAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(paint));
}

chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
chrome.runtime.onInstalled.addListener(paintAllTabs);
chrome.runtime.onStartup.addListener(paintAllTabs);

// onUpdated takes no filter argument, so narrow it down here instead.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ('mutedInfo' in changeInfo || changeInfo.status === 'complete') paint(tab);
  if ('mutedInfo' in changeInfo || 'audible' in changeInfo) notifyMutedAudible(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-mute') return;
  if (tab && typeof tab.id === 'number') toggleMuted(tab.id);
  else toggleActiveTab();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;
  if (message.type === 'get-muted-audio-state') {
    // A freshly loaded page asks for the state it may have missed.
    sendResponse({ active: isMutedAudible(sender.tab) });
    return false;
  }
  if (message.type !== 'toggle-mute') return false;
  // The popup passes an explicit tabId; the content script relies on sender.tab.
  const tabId = typeof message.tabId === 'number' ? message.tabId : sender.tab && sender.tab.id;
  if (typeof tabId !== 'number') return false;
  toggleMuted(tabId).then((muted) => sendResponse({ muted })).catch(() => sendResponse(null));
  return true;
});
