import { createElement, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { AuthPrompt } from './components/AuthPrompt/AuthPrompt';
import { FeedCard } from './components/FeedCard/FeedCard';
import type { ProfileData } from './types';

const feedCardRoots = new WeakMap<HTMLElement, Root>();

export function createFeedCard(profile: ProfileData, includeAuthPrompt = true): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'pf-feed-card';
  card.dataset.pfFeedCard = 'true';
  const root = createRoot(card);
  flushSync(() => {
    root.render(
      createElement(
        Fragment,
        null,
        createElement(FeedCard, { profile }),
        includeAuthPrompt ? createElement(AuthPrompt) : null
      )
    );
  });
  feedCardRoots.set(card, root);

  return card;
}

export function unmountFeedCard(card: HTMLElement): void {
  const root = feedCardRoots.get(card);
  if (root) {
    root.unmount();
    feedCardRoots.delete(card);
  }
}
