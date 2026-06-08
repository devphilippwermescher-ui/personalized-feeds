import { createElement, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { AuthPrompt } from './components/AuthPrompt/AuthPrompt';
import { CreateFeedForm } from './components/CreateFeedForm/CreateFeedForm';
import { FeedCard } from './components/FeedCard/FeedCard';
import { FeedSelectionList } from './components/FeedSelectionList/FeedSelectionList';
import type { ProfileData } from './types';

const feedCardRoots = new WeakMap<HTMLElement, Root>();

export function createFeedCard(profile: ProfileData): HTMLDivElement {
  const card = document.createElement('div');
  card.id = 'pf-feed-card';
  const root = createRoot(card);
  flushSync(() => {
    root.render(
      createElement(Fragment, null,
        createElement(FeedCard, { profile }),
        createElement(FeedSelectionList),
        createElement(CreateFeedForm),
        createElement(AuthPrompt)
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
