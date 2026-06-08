function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function animateScrollTop(element: HTMLElement, target: number): void {
  if (prefersReducedMotion()) {
    element.scrollTop = target;
    return;
  }

  const start = element.scrollTop;
  const distance = target - start;
  if (Math.abs(distance) < 2) {
    element.scrollTop = target;
    return;
  }

  const duration = Math.min(520, Math.max(260, Math.abs(distance) * 0.55));
  const startedAt = performance.now();

  const tick = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    element.scrollTop = start + distance * easeOutCubic(progress);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

function findFeedGroup(container: HTMLElement, feedId: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>('.lfa-feed-group')).find(
      (group) => group.getAttribute('data-feed-group-id') === feedId
    ) || null
  );
}

export function getFeedScrollContainer(container: HTMLElement): HTMLElement | null {
  const candidates = [
    container.querySelector<HTMLElement>('#lfa-feed-list'),
    container.querySelector<HTMLElement>('.lfa-sidebar-content'),
  ];

  return candidates.find((candidate) => candidate && candidate.scrollHeight > candidate.clientHeight + 1) || candidates[0] || null;
}

export function shouldCenterExpandedFeed(previousFeedId: string | null, nextFeedId: string | null): nextFeedId is string {
  return Boolean(nextFeedId && nextFeedId !== previousFeedId);
}

export function getExpandedFeedGroupHeight(container: HTMLElement, feedId: string | null): number {
  if (!feedId) {
    return 0;
  }

  return findFeedGroup(container, feedId)?.getBoundingClientRect().height || 0;
}

export function didExpandedFeedHeightChange(previousHeight: number, nextHeight: number): boolean {
  return Math.abs(nextHeight - previousHeight) > 24;
}

export function animateExpandedFeedCollapse(container: HTMLElement, feedId: string): Promise<void> {
  const feedGroup = findFeedGroup(container, feedId);
  const expandedEl = feedGroup?.querySelector<HTMLElement>('.lfa-feed-expanded');
  if (!expandedEl || prefersReducedMotion()) {
    return Promise.resolve();
  }

  const height = expandedEl.getBoundingClientRect().height;
  if (height <= 1) {
    return Promise.resolve();
  }

  expandedEl.style.height = `${height}px`;
  expandedEl.style.willChange = 'height, opacity, transform';
  expandedEl.classList.add('lfa-feed-expanded--collapsing');

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const animation = expandedEl.animate(
        [
          { height: `${height}px`, opacity: 1, transform: 'translateY(0) scaleY(1)' },
          { height: '0px', opacity: 0, transform: 'translateY(-8px) scaleY(0.985)' },
        ],
        {
          duration: 240,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        }
      );

      animation.onfinish = () => resolve();
      animation.oncancel = () => resolve();
    });
  });
}

export function stabilizeCollapsedFeedItem(container: HTMLElement, feedId: string): void {
  requestAnimationFrame(() => {
    const feedGroup = findFeedGroup(container, feedId);
    const feedItem = feedGroup?.querySelector<HTMLElement>('.lfa-feed-item');
    if (!feedItem || prefersReducedMotion()) {
      return;
    }

    feedItem.classList.add('lfa-feed-item--settling');
    window.setTimeout(() => {
      feedItem.classList.remove('lfa-feed-item--settling');
    }, 220);
  });
}

export function centerExpandedFeedInView(container: HTMLElement, feedId: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const feedList = getFeedScrollContainer(container);
      const feedGroup = findFeedGroup(container, feedId);
      if (!feedList || !feedGroup) return;

      const listRect = feedList.getBoundingClientRect();
      const groupRect = feedGroup.getBoundingClientRect();
      const margin = 10;
      const listH = feedList.clientHeight;
      const maxScrollTop = Math.max(0, feedList.scrollHeight - listH);
      const groupTopInScroll = feedList.scrollTop + groupRect.top - listRect.top;

      let target: number;

      if (groupRect.height + margin * 2 > listH) {
        const expandedEl = feedGroup.querySelector<HTMLElement>('.lfa-feed-expanded');
        const expandedTopInScroll = expandedEl
          ? feedList.scrollTop + expandedEl.getBoundingClientRect().top - listRect.top
          : groupTopInScroll;
        target = expandedTopInScroll - margin;
      } else {
        target = groupTopInScroll - (listH - groupRect.height) / 2;
      }

      const clamped = Math.max(0, Math.min(target, maxScrollTop));
      animateScrollTop(feedList, clamped);
    });
  });
}
