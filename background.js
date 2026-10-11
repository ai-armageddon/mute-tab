// Mute Tab - service worker.
// Owns the muting itself plus the per-tab toolbar badge, so the popup, the
// Chrome command and the in-page hotkey all funnel through the same code.

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

function hostOf(tab) {
  if (!tab || !tab.url) return '';
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function tabMatches(tab, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return false;
  return hostOf(tab).includes(needle) || String(tab.title || '').toLowerCase().includes(needle);
}

async function getGlobalMenuState(senderTabId) {
  const tabs = await chrome.tabs.query({});
  let currentTab = tabs.find((tab) => tab.id === senderTabId);
  if (!currentTab) {
    [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }

  const sites = new Map();
  for (const tab of tabs) {
    const host = hostOf(tab);
    if (!host) continue;
    const site = sites.get(host) || { host, count: 0, muted: 0, audible: 0 };
    site.count += 1;
    if (isMuted(tab)) site.muted += 1;
    if (tab.audible) site.audible += 1;
    sites.set(host, site);
  }

  return {
    current: currentTab ? {
      id: currentTab.id,
      host: hostOf(currentTab),
      muted: isMuted(currentTab),
      audible: Boolean(currentTab.audible)
    } : null,
    totalTabs: tabs.length,
    audibleTabs: tabs.filter((tab) => tab.audible).length,
    mutedTabs: tabs.filter(isMuted).length,
    sites: [...sites.values()].sort((a, b) => b.audible - a.audible || b.count - a.count || a.host.localeCompare(b.host))
  };
}

async function setMutedForTabs(tabs, muted) {
  const usable = tabs.filter((tab) => typeof tab.id === 'number');
  await Promise.all(usable.map((tab) => chrome.tabs.update(tab.id, { muted }).catch(() => null)));
  return usable.length;
}

async function runGlobalAction(action, value, senderTabId) {
  const tabs = await chrome.tabs.query({});
  if (action === 'toggle-current') {
    let tab = tabs.find((entry) => entry.id === senderTabId);
    if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || typeof tab.id !== 'number') return { changed: 0 };
    await toggleMuted(tab.id);
    return { changed: 1 };
  }

  let matching = [];
  if (action === 'mute-audible') matching = tabs.filter((tab) => tab.audible && !isMuted(tab));
  else if (action === 'unmute-all') matching = tabs.filter(isMuted);
  else if (action === 'mute-site' || action === 'unmute-site') matching = tabs.filter((tab) => hostOf(tab) === value);
  else if (action === 'mute-matching' || action === 'unmute-matching') matching = tabs.filter((tab) => tabMatches(tab, value));
  else throw new Error('Unknown global mute action');

  const muted = action.startsWith('mute-');
  return { changed: await setMutedForTabs(matching, muted) };
}

async function openGlobalMenu(tab) {
  if (tab && typeof tab.id === 'number') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'show-global-menu' });
      return;
    } catch {
      // Protected pages cannot host the in-page palette; use the toolbar popup.
    }
  }
  try {
    await chrome.action.openPopup();
  } catch {
    // Older Chromium builds may not expose openPopup to regular extensions.
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 380,
      height: 680
    }).catch(() => null);
  }
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
  if (command === 'toggle-mute') {
    if (tab && typeof tab.id === 'number') toggleMuted(tab.id);
    else toggleActiveTab();
  } else if (command === 'open-global-menu') {
    openGlobalMenu(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;
  if (message.type === 'get-muted-audio-state') {
    // A freshly loaded page asks for the state it may have missed.
    sendResponse({ active: isMutedAudible(sender.tab) });
    return false;
  }
  if (message.type === 'open-global-menu') {
    openGlobalMenu(sender.tab);
    return false;
  }
  if (message.type === 'get-global-menu-state') {
    getGlobalMenuState(sender.tab && sender.tab.id)
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }
  if (message.type === 'run-global-action') {
    runGlobalAction(message.action, message.value, sender.tab && sender.tab.id)
      .then(async (result) => ({ ...result, state: await getGlobalMenuState(sender.tab && sender.tab.id) }))
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message || 'Action failed' }));
    return true;
  }
  if (message.type !== 'toggle-mute') return false;
  // The popup passes an explicit tabId; the content script relies on sender.tab.
  const tabId = typeof message.tabId === 'number' ? message.tabId : sender.tab && sender.tab.id;
  if (typeof tabId !== 'number') return false;
  toggleMuted(tabId).then((muted) => sendResponse({ muted })).catch(() => sendResponse(null));
  return true;
});
