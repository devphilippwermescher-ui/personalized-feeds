import { beforeEach, describe, expect, it } from 'vitest';
import { extractProfileData, findProfileTopCardRoot } from '../logic/profile-data';

describe('profile data extraction', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/in/yuliia-biliavtseva/');
    document.body.innerHTML = '';
  });

  it('keeps identity extraction inside the current profile top card', () => {
    document.body.innerHTML = `
      <main>
        <h1>0 notifications ✦</h1>
        <div id="profile-top-card">
          <h2>Yuliia Biliavtseva</h2>
          <a href="/in/yuliia-biliavtseva/?trk=profile">Yuliia Biliavtseva</a>
          <button aria-label="Pending, click to withdraw invitation">Pending</button>
          <button aria-label="Message Yuliia">Message</button>
        </div>
      </main>
    `;

    expect(findProfileTopCardRoot()).toBe(document.querySelector('#profile-top-card'));
    expect(extractProfileData()).toMatchObject({
      linkedinUsername: 'yuliia-biliavtseva',
      displayName: 'Yuliia Biliavtseva',
    });
  });

  it('fails closed when only a broad page heading looks like profile identity', () => {
    document.body.innerHTML = `
      <main>
        <h1>0 notifications ✦</h1>
        <a href="/in/yuliia-biliavtseva/">Open profile</a>
        <section>
          <button aria-label="Invite Yuliia to connect">Connect</button>
          <button aria-label="Message Yuliia">Message</button>
        </section>
      </main>
    `;

    expect(findProfileTopCardRoot()).toBeNull();
    expect(extractProfileData()).toBeNull();
  });
});
