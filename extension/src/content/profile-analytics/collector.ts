import type {
  ProfileAnalyticsProfileSnapshot,
  ProfileAnalyticsSearchAppearancesSnapshot,
  ProfileAnalyticsSsiSnapshot,
} from 'shared/types';
import { extractProfileData } from '../profile-content/logic/profile-data';

export interface ProfileAnalyticsPageCollection {
  profile?: ProfileAnalyticsProfileSnapshot;
  searchAppearances?: ProfileAnalyticsSearchAppearancesSnapshot;
  socialSellingIndex?: ProfileAnalyticsSsiSnapshot;
  selfProfileUrl?: string;
  pageUrl: string;
  collectedAt: number;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function getPageText(): string {
  return normalizeText(document.body?.innerText || document.body?.textContent || '');
}

function normalizeLinkedInProfileUrl(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    const match = url.pathname.match(/^\/in\/([^/]+)\/?/);
    if (!match?.[1]) {
      return undefined;
    }

    return `https://www.linkedin.com/in/${match[1]}/`;
  } catch {
    return undefined;
  }
}

function findSelfProfileUrl(): string | undefined {
  const currentProfileUrl = normalizeLinkedInProfileUrl(window.location.href);
  if (currentProfileUrl && /^\/in\/[^/]+\/?$/.test(window.location.pathname)) {
    return currentProfileUrl;
  }

  const selectors = [
    '.global-nav__me-content a[href*="/in/"]',
    '.global-nav__me a[href*="/in/"]',
    '[data-test-global-nav-me] a[href*="/in/"]',
    'a[aria-label*="View profile" i][href*="/in/"]',
    'a[href*="/in/"][href*="miniProfileUrn"]',
  ];

  for (const selector of selectors) {
    const link = document.querySelector<HTMLAnchorElement>(selector);
    const url = link ? normalizeLinkedInProfileUrl(link.href) : undefined;
    if (url) {
      return url;
    }
  }

  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/,/g, '').trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)([kKmM])?/);
  if (!match) {
    return undefined;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return undefined;
  }

  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'k') return Math.round(base * 1000);
  if (suffix === 'm') return Math.round(base * 1000000);
  return Math.round(base);
}

function extractNumberNear(text: string, labels: RegExp[]): number | undefined {
  for (const label of labels) {
    const labelMatch = label.exec(text);
    if (!labelMatch) {
      continue;
    }

    const before = text.slice(Math.max(0, labelMatch.index - 90), labelMatch.index);
    const after = text.slice(labelMatch.index, labelMatch.index + 140);
    const beforeNumbers = Array.from(before.matchAll(/([\d,.]+(?:[kKmM])?)/g));
    const afterNumber = after.match(/([\d,.]+(?:[kKmM])?)/);
    const nearestBefore = beforeNumbers[beforeNumbers.length - 1]?.[1];
    const parsed = parseNumber(nearestBefore) ?? parseNumber(afterNumber?.[1]);
    if (typeof parsed === 'number') {
      return parsed;
    }
  }

  return undefined;
}

function extractPeriodLabel(text: string): string | undefined {
  return text.match(/Last\s+(?:7|14|30|60|90)\s+days/i)?.[0] ||
    text.match(/Past\s+(?:7|14|30|60|90)\s+days/i)?.[0] ||
    text.match(/This\s+week/i)?.[0] ||
    undefined;
}

function collectProfileSnapshot(collectedAt: number): ProfileAnalyticsProfileSnapshot | undefined {
  if (!/^\/in\/[^/]+\/?$/.test(window.location.pathname)) {
    return undefined;
  }

  const profile = extractProfileData();
  if (!profile?.displayName) {
    return undefined;
  }

  return {
    linkedinUrl: profile.linkedinUrl,
    linkedinUsername: profile.linkedinUsername,
    profileUrn: profile.profileUrn,
    memberNumericId: profile.memberNumericId,
    displayName: profile.displayName,
    headline: profile.headline,
    profileImageUrl: profile.profileImageUrl,
    company: profile.company,
    location: profile.location,
    connectionsCount: profile.connectionsCount,
    followersCount: profile.followersCount,
    updatedAt: collectedAt,
    sourceUrl: window.location.href,
  };
}

function collectSearchAppearances(collectedAt: number): ProfileAnalyticsSearchAppearancesSnapshot | undefined {
  const text = getPageText();
  const isSearchAppearancesPage =
    /\/analytics\/search-appearances/i.test(window.location.pathname) ||
    /Search appearances/i.test(text);
  if (!isSearchAppearancesPage) {
    return undefined;
  }

  const totalCount = extractNumberNear(text, [
    /Search appearances/i,
    /Searches? you appeared in/i,
    /Profile appearances/i,
    /All appearances/i,
  ]);

  return {
    totalCount,
    periodLabel: extractPeriodLabel(text),
    updatedAt: collectedAt,
    sourceUrl: window.location.href,
  };
}

function collectSocialSellingIndex(collectedAt: number): ProfileAnalyticsSsiSnapshot | undefined {
  const text = getPageText();
  const isSsiPage =
    /\/sales\/ssi/i.test(window.location.pathname) ||
    /Social Selling Index|\bSSI\b/i.test(text);
  if (!isSsiPage) {
    return undefined;
  }

  const score =
    parseNumber(text.match(/(\d{1,3})\s*\/\s*100/)?.[1]) ??
    extractNumberNear(text, [/Social Selling Index/i, /\bSSI\b/i]);

  return {
    score: typeof score === 'number' ? Math.min(100, Math.max(0, score)) : undefined,
    updatedAt: collectedAt,
    sourceUrl: window.location.href,
  };
}

export function collectProfileAnalyticsFromCurrentPage(): ProfileAnalyticsPageCollection {
  const collectedAt = Date.now();

  return {
    profile: collectProfileSnapshot(collectedAt),
    searchAppearances: collectSearchAppearances(collectedAt),
    socialSellingIndex: collectSocialSellingIndex(collectedAt),
    selfProfileUrl: findSelfProfileUrl(),
    pageUrl: window.location.href,
    collectedAt,
  };
}
