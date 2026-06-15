import type { ProfileViewerInput } from 'shared/types';

const PROFILE_VIEWERS_URL = 'https://www.linkedin.com/me/profile-views?skipRedirect=true';

function waitForTabComplete(tabId: number, timeoutMs = 25_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('Timed out waiting for LinkedIn profile viewers tab to load'));
    }, timeoutMs);

    const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }

      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(onUpdated);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (tab.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    });
  });
}

async function scrapeProfileViewersFromPageDom(): Promise<ProfileViewerInput[]> {
  function normalizeText(value: string): string {
    return (value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
  }

  function normalizeProfileUrl(rawHref: string): { linkedinUrl: string; linkedinUsername: string } | null {
    try {
      const url = new URL(rawHref, 'https://www.linkedin.com');
      const match = url.pathname.match(/^\/in\/([^/?#]+)/i);
      if (!match?.[1]) {
        return null;
      }

      const linkedinUsername = decodeURIComponent(match[1]).trim().toLowerCase();
      const reservedUsernames = new Set(['me', 'null', 'undefined', 'profile', 'settings']);
      if (
        linkedinUsername.length < 3 ||
        reservedUsernames.has(linkedinUsername) ||
        !/^[\p{L}\p{N}_.~-]+$/u.test(linkedinUsername)
      ) {
        return null;
      }

      return {
        linkedinUsername,
        linkedinUrl: `https://www.linkedin.com/in/${encodeURIComponent(linkedinUsername)}/`,
      };
    } catch {
      return null;
    }
  }

  function collect(): ProfileViewerInput[] {
    const viewers: ProfileViewerInput[] = [];
    const seenUsernames = new Set<string>();
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'));

    for (const anchor of anchors) {
      const profile = normalizeProfileUrl(anchor.href);
      if (!profile || seenUsernames.has(profile.linkedinUsername)) {
        continue;
      }

      const rowText = normalizeText(anchor.innerText || anchor.textContent || '');
      const viewedAgoText = normalizeText(rowText.match(/Viewed\s+.+?\sago/i)?.[0] || '');
      if (!viewedAgoText) {
        continue;
      }

      const image = anchor.querySelector<HTMLImageElement>('img[alt]');
      const svgWithLabel = anchor.querySelector<SVGElement>('svg[aria-label]');
      const displayName = normalizeText(image?.alt || svgWithLabel?.getAttribute('aria-label') || '');
      if (!displayName) {
        continue;
      }

      const mutualConnectionsText = normalizeText(rowText.match(/\d+\s+mutual\s+connections?/i)?.[0] || '');
      const connectionDegree = normalizeText(rowText.match(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/i)?.[1] || '');
      let headline = rowText;
      [displayName, viewedAgoText, mutualConnectionsText, 'Connect', 'Message', 'Follow'].forEach((part) => {
        if (part) {
          headline = headline.replace(part, ' ');
        }
      });
      headline = normalizeText(headline.replace(/[•\u2022]\s*(1st|2nd|3rd|\d+th)/gi, ' '));

      seenUsernames.add(profile.linkedinUsername);
      viewers.push({
        ...profile,
        displayName,
        headline,
        profileImageUrl: image?.src || '',
        connectionDegree,
        viewedAgoText,
        mutualConnectionsText,
      });
    }

    return viewers;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 12_000) {
    const viewers = collect();
    if (viewers.length > 0) {
      return viewers;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return collect();
}

export async function scrapeProfileViewersFromInactiveTab(): Promise<ProfileViewerInput[]> {
  const tab = await chrome.tabs.create({
    url: PROFILE_VIEWERS_URL,
    active: false,
  });

  if (!tab.id) {
    return [];
  }

  try {
    await waitForTabComplete(tab.id);
    const [executionResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeProfileViewersFromPageDom,
    });

    return Array.isArray(executionResult?.result) ? (executionResult.result as ProfileViewerInput[]) : [];
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {
      /* ignore cleanup failures */
    });
  }
}
