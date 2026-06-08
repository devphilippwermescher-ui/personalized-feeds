const INTEROP_IFRAME_SELECTOR = 'iframe[data-testid="interop-iframe"]';

export function getInteropIframe(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(INTEROP_IFRAME_SELECTOR);
}

export function getActiveDocument(): Document {
  const iframe = getInteropIframe();
  const iframeDoc = iframe?.contentDocument;
  const iframeReady = Boolean(iframeDoc?.body);

  if (!iframeReady) return document;

  if (isProfileActivityPage()) {
    return iframeDoc as Document;
  }

  return document;
}

export function isProfileActivityPage(): boolean {
  return /\/in\/[^/]+\/recent-activity/.test(window.location.pathname);
}

export function isMainFeedPage(): boolean {
  return window.location.pathname === '/feed/' || window.location.pathname === '/feed';
}

export function getFeedContainer(): Element | null {
  const doc = getActiveDocument();
  if (isProfileActivityPage()) {
    const scrollContent = doc.querySelector('.scaffold-finite-scroll__content');
    if (scrollContent) {
      const ul = scrollContent.querySelector('ul.display-flex');
      if (ul) return ul;
    }
    const fallbackUl = doc.querySelector('.pv-recent-activity-detail__core-rail ul.display-flex');
    if (fallbackUl) return fallbackUl;
  }

  const selectors = [
    '.scaffold-finite-scroll__content[data-finite-scroll-hotkey-context="FEED"]',
    '.scaffold-finite-scroll__content',
    '.core-rail .scaffold-finite-scroll__content',
  ];

  for (const selector of selectors) {
    const container = doc.querySelector(selector);
    if (container) return container;
  }

  return null;
}

export function getScrollContainer(): Element | null {
  const doc = getActiveDocument();
  const selectors = ['.scaffold-layout__main', '.scaffold-finite-scroll__content', '.core-rail', 'main'];

  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

function findProfileActivitySection(): HTMLElement | null {
  const doc = getActiveDocument();
  const activityLabels = ['All activity', 'Все действия', 'Alle Aktivitäten', 'Toda la actividad'];
  const exactSection = doc.querySelector<HTMLElement>(
    '.pv-recent-activity-detail__core-rail > section.artdeco-card.pb3'
  );
  if (exactSection) {
    return exactSection;
  }

  const headingMatch = Array.from(doc.querySelectorAll<HTMLElement>('h1, h2, h3')).find((heading) => {
    const text = heading.textContent?.trim() || '';
    return activityLabels.some((label) => text.includes(label));
  });
  const headingSection = headingMatch?.closest('section');
  if (headingSection) {
    return headingSection;
  }

  const exactRoleGroup = doc.querySelector<HTMLElement>('[role="group"][aria-label="Select type of recent activity"]');
  const roleGroupSection = exactRoleGroup?.closest('section');
  if (roleGroupSection) {
    return roleGroupSection;
  }

  const sectionRoots = [
    doc.querySelector('.pv-recent-activity-detail__core-rail'),
    doc.querySelector('main'),
    doc.body,
  ].filter(Boolean) as Element[];

  for (const root of sectionRoots) {
    const directMatch = Array.from(root.querySelectorAll<HTMLElement>('section')).find((section) => {
      const heading = section.querySelector<HTMLElement>('h1, h2, h3');
      const headingText = heading?.textContent?.trim() || '';
      const hasActivityHeading = activityLabels.some((label) => headingText.includes(label));
      const pills = section.querySelectorAll('.profile-creator-shared-pills__pill');
      const hasRoleGroup = Boolean(section.querySelector('[aria-label="Select type of recent activity"]'));
      const hasFeedBody = Boolean(
        section.querySelector(
          '.scaffold-finite-scroll, .scaffold-finite-scroll__content, ul.display-flex, .feed-shared-update-v2, [role="article"]'
        )
      );

      return (hasActivityHeading || hasRoleGroup) && pills.length >= 2 && hasFeedBody;
    });

    if (directMatch) {
      return directMatch;
    }
  }

  for (const root of sectionRoots) {
    const roleGroup = root.querySelector<HTMLElement>('[aria-label="Select type of recent activity"]');
    const groupSection = roleGroup?.closest('section');
    if (groupSection) {
      return groupSection;
    }

    const pillsSection = root.querySelector('.profile-creator-shared-pills__pill')?.closest('section');
    if (pillsSection) {
      return pillsSection;
    }
  }

  const postsList = doc.querySelector(
    '.scaffold-finite-scroll__content ul.display-flex, ul.display-flex.list-style-none.justify-center'
  );
  const pillsBlock = doc.querySelector(
    '[aria-label="Select type of recent activity"], .profile-creator-shared-pills__pill'
  );
  if (postsList && pillsBlock) {
    const sharedSection = (postsList as Element).closest('section');
    if (sharedSection) {
      return sharedSection as HTMLElement;
    }

    const sharedRail =
      (postsList as Element).closest('.pv-recent-activity-detail__core-rail') ||
      (postsList as Element).closest('main');
    if (sharedRail) {
      return sharedRail as HTMLElement;
    }
  }

  return null;
}

export function findProfileAnchor(): Element | null {
  const doc = getActiveDocument();
  const exactTabsBlock = doc.querySelector<HTMLElement>(
    '.pv-recent-activity-detail__core-rail > section.artdeco-card.pb3 > .mb3'
  );
  if (exactTabsBlock) return exactTabsBlock;

  const exactRoleGroup = doc.querySelector<HTMLElement>(
    '[role="group"][aria-label="Select type of recent activity"]'
  );
  const exactRoleTabsBlock = exactRoleGroup?.closest('.mb3');
  if (exactRoleTabsBlock) return exactRoleTabsBlock;

  const activitySection = findProfileActivitySection();
  if (!activitySection) {
    return null;
  }

  const scopedTabsBlock = activitySection.querySelector<HTMLElement>(':scope > .mb3');
  if (scopedTabsBlock) return scopedTabsBlock;

  const pillsContainer = activitySection
    .querySelector('.profile-creator-shared-pills__pill')
    ?.closest('.mb3');
  if (pillsContainer) return pillsContainer;

  const explicitTabsContainer = activitySection
    .querySelector('[aria-label="Select type of recent activity"]')
    ?.closest('.mb3');
  if (explicitTabsContainer) return explicitTabsContainer;

  const activityHeading = activitySection.querySelector<HTMLElement>('h1, h2, h3');
  return activityHeading || activitySection;
}

export function findFirstProfileActivityPost(): Element | null {
  if (!isProfileActivityPage()) {
    return null;
  }
  const doc = getActiveDocument();

  const exactFirstPostFromDocument = doc.querySelector<HTMLElement>(
    '.pv-recent-activity-detail__core-rail > section.artdeco-card.pb3 .scaffold-finite-scroll__content > ul > li'
  );
  if (exactFirstPostFromDocument) {
    return exactFirstPostFromDocument;
  }

  const activitySection = findProfileActivitySection();
  const searchRoot: ParentNode = activitySection || doc;
  const exactFirstPost = activitySection?.querySelector<HTMLElement>(
    ':scope > .pv0 .scaffold-finite-scroll__content > ul > li'
  );
  if (exactFirstPost) {
    return exactFirstPost;
  }

  const post =
    searchRoot.querySelector('[data-id^="urn:li:activity:"]') ||
    searchRoot.querySelector('[data-urn^="urn:li:activity:"]') ||
    searchRoot.querySelector('.feed-shared-update-v2[role="article"]') ||
    searchRoot.querySelector('.scaffold-finite-scroll__content li') ||
    searchRoot.querySelector('ul.display-flex > li') ||
    searchRoot.querySelector('.relative.artdeco-card') ||
    doc.querySelector('.pv-recent-activity-detail__core-rail .feed-shared-update-v2') ||
    doc.querySelector('main .feed-shared-update-v2') ||
    doc.querySelector('main ul.display-flex.list-style-none.justify-center > li');

  if (!post) {
    return null;
  }

  return (
    post.closest('li') ||
    post.closest('[data-finite-scroll-hotkey-item]') ||
    post.closest('.fie-impression-container') ||
    post
  );
}

export function waitForFeedToLoad(): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 20;

    const check = () => {
      attempts++;
      const doc = getActiveDocument();
      const feedContainer = doc.querySelector('.scaffold-finite-scroll, [data-finite-scroll-hotkey-context]');
      const body = doc.body;
      const pageHeight = body ? body.scrollHeight : 0;
      const hasContent = pageHeight > 1500;

      if ((feedContainer && hasContent) || attempts >= maxAttempts) {
        resolve();
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });
}
