import { beforeEach, describe, expect, it } from 'vitest';
import { findMessagingDrawerProfileTargets } from '../profile-card';

describe('Messaging drawer profile card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts the profile from the LinkedIn compact conversation card', () => {
    document.body.innerHTML = `
      <div class="msg-s-profile-card msg-s-profile-card-one-to-one ph3">
        <div class="artdeco-entity-lockup__image"><img src="https://media.licdn.com/gabriel.jpg" /></div>
        <div class="artdeco-entity-lockup__title display-flex truncate align-items-center">
          <a class="profile-card-one-to-one__profile-link" href="/in/ACoAA-gabriel/">Gabriel P Bernes</a>
          <div class="artdeco-entity-lockup__badge">
            <span class="a11y-text">1st degree connection</span>
            <span class="artdeco-entity-lockup__degree" aria-hidden="true">· 1st</span>
          </div>
        </div>
        <div class="artdeco-entity-lockup__subtitle">Software Engineer</div>
      </div>
    `;

    const targets = findMessagingDrawerProfileTargets(document);

    expect(targets).toHaveLength(1);
    expect(targets[0].identityRow.className).toContain('artdeco-entity-lockup__title');
    expect(targets[0].profile).toMatchObject({
      linkedinUsername: 'ACoAA-gabriel',
      displayName: 'Gabriel P Bernes',
      connectionDegree: '1st',
      headline: 'Software Engineer',
      profileImageUrl: 'https://media.licdn.com/gabriel.jpg',
    });
  });

  it('does not treat unrelated LinkedIn profile blocks as a messaging drawer card', () => {
    document.body.innerHTML = `
      <section class="artdeco-entity-lockup">
        <div class="artdeco-entity-lockup__title"><a href="/in/example/">Example Person</a> · 1st</div>
      </section>
    `;

    expect(findMessagingDrawerProfileTargets(document)).toEqual([]);
  });

  it('ignores the extension control icon when LinkedIn hydrates the avatar later', () => {
    document.body.innerHTML = `
      <div class="msg-s-profile-card msg-s-profile-card-one-to-one ph3">
        <div class="artdeco-entity-lockup__title">
          <a class="profile-card-one-to-one__profile-link" href="/in/olga-titienkova/">Olga Titienkova</a>
          <span class="artdeco-entity-lockup__degree">· 2nd</span>
          <span class="lfa-messaging-drawer-feed-btn-wrapper">
            <button><img src="chrome-extension://extension-id/icons/icon48.png" /></button>
          </span>
        </div>
        <img class="presence-entity__image" src="https://media.licdn.com/dms/image/profile-displayphoto-shrink_100_100/olga" />
      </div>
    `;

    expect(findMessagingDrawerProfileTargets(document)[0]?.profile.profileImageUrl).toBe(
      'https://media.licdn.com/dms/image/profile-displayphoto-shrink_100_100/olga'
    );
  });
});
