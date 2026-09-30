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

  it('finds a localized action bar from stable links and icons', () => {
    document.body.innerHTML = `
      <section id="localized-profile-card" componentkey="ProfileTopcard">
        <div id="localized-profile-details">
          <h1>Dr. Henrie Dennis</h1>
          <div id="localized-profile-actions">
            <a href="/messaging/compose/?recipient=profile">Отправить сообщение</a>
            <button aria-expanded="false"><svg id="overflow-web-ios-small"></svg><span>Еще</span></button>
          </div>
        </div>
      </section>
    `;
    const feedCard = document.createElement('div');
    const profileCard = document.getElementById('localized-profile-card') as HTMLElement;

    insertFeedCardIntoPrimaryTopCard(feedCard, profileCard);

    expect(document.getElementById('localized-profile-details')?.nextElementSibling).toBe(feedCard);
    expect(feedCard.classList.contains('pf-feed-card--primary')).toBe(true);
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

  it('aligns the primary card with the profile content inset', () => {
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
    const firstAction = actions.querySelector('button') as HTMLButtonElement;
    const feedCard = document.createElement('div');
    vi.spyOn(primaryCard, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 700,
      left: 10,
      right: 1590,
      width: 1580,
      height: 700,
      x: 10,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({
      top: 400,
      bottom: 460,
      left: 10,
      right: 1590,
      width: 1580,
      height: 60,
      x: 10,
      y: 400,
      toJSON: () => ({}),
    });
    vi.spyOn(firstAction, 'getBoundingClientRect').mockReturnValue({
      top: 400,
      bottom: 460,
      left: 58,
      right: 230,
      width: 172,
      height: 60,
      x: 58,
      y: 400,
      toJSON: () => ({}),
    });
    vi.spyOn(feedCard, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      bottom: 600,
      left: 10,
      right: 1590,
      width: 1580,
      height: 100,
      x: 10,
      y: 500,
      toJSON: () => ({}),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    insertFeedCardIntoPrimaryTopCard(feedCard, primaryCard);

    expect(feedCard.style.getPropertyValue('--pf-primary-card-inline-inset')).toBe('48px');
  });

  it('does not apply the outer top-card inset twice inside a padded content container', () => {
    document.body.innerHTML = `
      <section id="primary-card">
        <div id="profile-content">
          <div id="primary-actions">
            <button aria-label="Connect">Connect</button>
            <button aria-label="Message">Message</button>
          </div>
        </div>
      </section>
    `;
    const primaryCard = document.getElementById('primary-card') as HTMLElement;
    const content = document.getElementById('profile-content') as HTMLElement;
    const actions = document.getElementById('primary-actions') as HTMLElement;
    const firstAction = actions.querySelector('button') as HTMLButtonElement;
    const feedCard = document.createElement('div');
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 700,
      left: 106,
      right: 1594,
      width: 1488,
      height: 700,
      x: 106,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({
      top: 400,
      bottom: 460,
      left: 106,
      right: 590,
      width: 484,
      height: 60,
      x: 106,
      y: 400,
      toJSON: () => ({}),
    });
    vi.spyOn(firstAction, 'getBoundingClientRect').mockReturnValue({
      top: 400,
      bottom: 460,
      left: 106,
      right: 280,
      width: 174,
      height: 60,
      x: 106,
      y: 400,
      toJSON: () => ({}),
    });
    vi.spyOn(feedCard, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      bottom: 600,
      left: 106,
      right: 1594,
      width: 1488,
      height: 100,
      x: 106,
      y: 500,
      toJSON: () => ({}),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    insertFeedCardIntoPrimaryTopCard(feedCard, primaryCard);

    expect(feedCard.parentElement).toBe(content);
    expect(feedCard.style.getPropertyValue('--pf-primary-card-inline-inset')).toBe('0px');
  });

  it('balances the visible space above and below the primary card', () => {
    document.body.innerHTML = `
      <section id="primary-card">
        <div id="primary-actions">
          <button aria-label="Connect">Connect</button>
          <button aria-label="Message">Message</button>
        </div>
        <div id="following-content">Open to work</div>
      </section>
    `;
    const primaryCard = document.getElementById('primary-card') as HTMLElement;
    const actions = document.getElementById('primary-actions') as HTMLElement;
    const firstAction = actions.querySelector('button') as HTMLButtonElement;
    const followingContent = document.getElementById('following-content') as HTMLElement;
    const feedCard = document.createElement('div');
    vi.spyOn(primaryCard, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 760,
      left: 0,
      right: 1600,
      width: 1600,
      height: 760,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(actions, 'getBoundingClientRect').mockReturnValue({
      top: 340,
      bottom: 400,
      left: 0,
      right: 1600,
      width: 1600,
      height: 60,
      x: 0,
      y: 340,
      toJSON: () => ({}),
    });
    vi.spyOn(firstAction, 'getBoundingClientRect').mockReturnValue({
      top: 340,
      bottom: 400,
      left: 48,
      right: 220,
      width: 172,
      height: 60,
      x: 48,
      y: 340,
      toJSON: () => ({}),
    });
    vi.spyOn(feedCard, 'getBoundingClientRect').mockReturnValue({
      top: 480,
      bottom: 620,
      left: 48,
      right: 1552,
      width: 1504,
      height: 140,
      x: 48,
      y: 480,
      toJSON: () => ({}),
    });
    vi.spyOn(followingContent, 'getBoundingClientRect').mockReturnValue({
      top: 660,
      bottom: 740,
      left: 48,
      right: 800,
      width: 752,
      height: 80,
      x: 48,
      y: 660,
      toJSON: () => ({}),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    insertFeedCardIntoPrimaryTopCard(feedCard, primaryCard);

    expect(feedCard.style.marginTop).toBe('-20px');
    expect(feedCard.style.marginBottom).toBe('20px');
  });
});
