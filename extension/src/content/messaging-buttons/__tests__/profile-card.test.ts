import { beforeEach, describe, expect, it } from 'vitest';
import { findMessagingProfileTargets, isLinkedInMessagingRoute } from '../logic/profile-card';

describe('LinkedIn messaging profile cards', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('recognizes LinkedIn messaging routes', () => {
    expect(isLinkedInMessagingRoute('/messaging/thread/abc/')).toBe(true);
    expect(isLinkedInMessagingRoute('/messaging/')).toBe(true);
    expect(isLinkedInMessagingRoute('/feed/')).toBe(false);
  });

  it('extracts the profile beside the connection degree', () => {
    document.body.innerHTML = `
      <section class="msg-thread__profile-card">
        <img src="https://media.licdn.com/gabriel.jpg" alt="Gabriel P Bernes" />
        <div class="msg-thread__profile-header">
          <a href="https://www.linkedin.com/in/gabriel-bernes/">Gabriel P Bernes</a>
          <span aria-hidden="true">·</span>
          <span class="msg-thread__connection-degree">· 1st</span>
        </div>
        <p class="msg-thread__profile-headline">Software Engineer | Mobile</p>
      </section>
    `;

    const targets = findMessagingProfileTargets(document);

    expect(targets).toHaveLength(1);
    expect(targets[0].degreeElement.textContent).toBe('· 1st');
    expect(targets[0].profile).toMatchObject({
      linkedinUsername: 'gabriel-bernes',
      displayName: 'Gabriel P Bernes',
      headline: 'Software Engineer | Mobile',
      profileImageUrl: 'https://media.licdn.com/gabriel.jpg',
      connectionDegree: '1st',
    });
  });

  it('supports a hashed card when the name and degree share a semantic row', () => {
    document.body.innerHTML = `
      <div class="hashed-card">
        <div class="hashed-title-row">
          <a aria-label="View Ada Lovelace’s profile" href="/in/ada-lovelace/">Ada Lovelace</a>
          <span><span>2nd</span></span>
        </div>
      </div>
    `;

    expect(findMessagingProfileTargets(document)[0]?.profile).toMatchObject({
      linkedinUsername: 'ada-lovelace',
      displayName: 'Ada Lovelace',
      connectionDegree: '2nd',
    });
  });
});
