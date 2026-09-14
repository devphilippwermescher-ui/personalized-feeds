export interface LinkedInProfileMetadataPageSnapshot {
  pageUrl: string;
  linkedinUsername: string;
  location?: string;
}

/**
 * Runs through `chrome.scripting.executeScript` and must stay self-contained:
 * imported runtime values are unavailable after Chrome serializes the function.
 * It only reads an already loaded own-profile document; it never navigates.
 */
export function collectLinkedInProfileMetadataFromCurrentPage(
  expectedLinkedinUsername: string
): LinkedInProfileMetadataPageSnapshot | null {
  const normalize = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();
  const pathMatch = window.location.pathname.match(/^\/in\/([^/]+)\/?$/i);
  const pageUsername = pathMatch ? decodeURIComponent(pathMatch[1]).toLowerCase() : '';
  if (!pageUsername || pageUsername !== expectedLinkedinUsername.trim().toLowerCase()) return null;

  const root = document.querySelector('main') || document.body;
  const contactLink = Array.from(root.querySelectorAll('a')).find(
    (link) => normalize(link.textContent).toLowerCase() === 'contact info'
  );
  let location = '';

  if (contactLink) {
    const contactRow = contactLink.closest('p, span, div');
    const parent = contactRow?.parentElement;
    if (contactRow && parent) {
      const siblings = Array.from(parent.children);
      const contactIndex = siblings.indexOf(contactRow);
      for (let index = contactIndex - 1; index >= 0; index -= 1) {
        const candidate = normalize(siblings[index].textContent);
        if (!candidate || candidate === '·') continue;
        if (candidate.length <= 120 && !/\b(?:connections?|followers?)\b/i.test(candidate)) {
          location = candidate;
          break;
        }
      }
    }
  }

  return {
    pageUrl: window.location.href,
    linkedinUsername: pageUsername,
    ...(location ? { location } : {}),
  };
}

export async function readLinkedInProfileMetadataFromExistingTab(
  linkedInTabId: number | undefined,
  linkedinUsername: string
): Promise<LinkedInProfileMetadataPageSnapshot | null> {
  if (typeof linkedInTabId !== 'number') return null;
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: linkedInTabId },
      func: collectLinkedInProfileMetadataFromCurrentPage,
      args: [linkedinUsername],
    });
    return result[0]?.result || null;
  } catch (error) {
    console.info('[profile-analytics] already-open profile page metadata was unavailable', {
      linkedInTabId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
