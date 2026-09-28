import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupProfileContentDomBindings } from '../logic/dom-bindings';
import { insertFeedCardIntoPrimaryTopCard, insertFeedCardIntoTopCard } from '../logic/feed-card-placement';
import { createFeedCard, unmountFeedCard } from '../template';
import type { ProfileData } from '../types';

const profile: ProfileData = {
  linkedinUrl: 'https://www.linkedin.com/in/test-profile/',
  linkedinUsername: 'test-profile',
  displayName: 'Test Profile',
};

describe('profile feed card surfaces', () => {
  const cards: HTMLElement[] = [];

  afterEach(() => {
    cards.forEach((card) => unmountFeedCard(card));
    cards.length = 0;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders independent primary and sticky cards with only one auth prompt', () => {
    const primaryCard = createFeedCard(profile);
    const stickyCard = createFeedCard(profile, false);
    cards.push(primaryCard, stickyCard);
    document.body.append(primaryCard, stickyCard);

    expect(document.querySelectorAll('[data-pf-feed-card="true"]')).toHaveLength(2);
    expect(document.querySelectorAll('.pf-add-to-feed-button')).toHaveLength(2);
    expect(document.querySelectorAll('#pf-auth-overlay')).toHaveLength(1);
  });

  it('binds the add action on both rendered surfaces', () => {
    const primaryCard = createFeedCard(profile);
    const stickyCard = createFeedCard(profile, false);
    cards.push(primaryCard, stickyCard);
    document.body.append(primaryCard, stickyCard);
    const handleAddToFeed = vi.fn(async () => undefined);

    setupProfileContentDomBindings({
      handleAddToFeed,
      showCreateFeedOverlay: vi.fn(),
      refreshCardState: vi.fn(async () => undefined),
      getCurrentProfileData: () => profile,
      sendMessageToBackground: vi.fn(async () => null),
      showToast: vi.fn(),
      emitFeedMemberAdded: vi.fn(),
    });

    document.querySelectorAll<HTMLButtonElement>('.pf-add-to-feed-button').forEach((button) => button.click());

    expect(handleAddToFeed).toHaveBeenCalledTimes(2);
  });

  it('uses the existing top-card insertion strategy for both primary and sticky surfaces', () => {
    document.body.innerHTML = `
      <section id="primary-card">
        <div id="primary-actions">
          <button aria-label="Connect">Connect</button>
          <button aria-label="Message">Message</button>
        </div>
      </section>
      <section id="sticky-card">
        <div class="ph5"></div>
      </section>
    `;
    const primaryFeedCard = document.createElement('div');
    const stickyFeedCard = document.createElement('div');
    const primaryCard = document.getElementById('primary-card') as HTMLElement;
    const stickyCard = document.getElementById('sticky-card') as HTMLElement;

    insertFeedCardIntoPrimaryTopCard(primaryFeedCard, primaryCard);
    insertFeedCardIntoTopCard(stickyFeedCard, stickyCard);

    expect(document.getElementById('primary-actions')?.nextElementSibling).toBe(primaryFeedCard);
    expect(primaryFeedCard.classList.contains('pf-feed-card--primary')).toBe(true);
    expect(stickyCard.querySelector('.ph5')?.firstElementChild).toBe(stickyFeedCard);
  });

  it('inserts into the current profile toolbar instead of a right-rail card', () => {
    document.body.innerHTML = `
      <div id="profile-toolbar" role="toolbar">
        <div id="toolbar-row">
          <a href="/in/prashantrathi1/"><p>Prashant Rathi</p></a>
          <div id="toolbar-actions">
            <button aria-label="More" aria-expanded="false">More</button>
            <a href="/messaging/compose/?recipient=profile">Message</a>
            <button aria-label="Follow Prashant Rathi">Follow</button>
          </div>
        </div>
      </div>
    `;
    const feedCard = document.createElement('div');
    const toolbar = document.getElementById('profile-toolbar') as HTMLElement;

    insertFeedCardIntoTopCard(feedCard, toolbar);

    expect(document.getElementById('toolbar-actions')?.nextElementSibling).toBe(feedCard);
  });

  it('moves the primary card below LinkedIn action buttons when their layout overlaps it', () => {
    document.body.innerHTML = `
      <section id="primary-card">
        <div id="primary-actions">
          <button aria-label="Connect">Connect</button>
          <button aria-label="Message">Message</button>
        </div>
      </section>
    `;
    const primaryCard = document.getElementById('primary-card') as HTMLElement;
    const actions = document.getElementById('primary-actions') as HTMLElement;
    const feedCard = document.createElement('div');
    vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({
      top: 40,
      bottom: 100,
      left: 0,
      right: 200,
      width: 200,
      height: 60,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    });
    vi.spyOn(feedCard, 'getBoundingClientRect').mockReturnValue({
      top: 50,
      bottom: 130,
      left: 0,
      right: 400,
      width: 400,
      height: 80,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    insertFeedCardIntoPrimaryTopCard(feedCard, primaryCard);

    expect(feedCard.style.marginTop).toBe('66px');
  });
});
