import { beforeEach, describe, expect, it } from 'vitest';
import { extractProfileData, findPrimaryProfileTopCardRoot, findProfileTopCardRoot } from '../logic/profile-data';

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

    expect(findPrimaryProfileTopCardRoot()).toBe(document.querySelector('#profile-top-card'));
    expect(extractProfileData()).toMatchObject({
      linkedinUsername: 'yuliia-biliavtseva',
      displayName: 'Yuliia Biliavtseva',
    });
  });

  it('finds the initial profile hero before LinkedIn renders its sticky header', () => {
    window.history.pushState({}, '', '/in/kishan-dobariya/');
    document.body.innerHTML = `
      <header>
        <section id="sticky-profile-header">
          <h2>Kishan Dobariya</h2>
          <a href="/in/kishan-dobariya/?trk=sticky-header">Kishan Dobariya</a>
          <button aria-label="Invite Kishan to connect">Connect</button>
          <button aria-label="Message Kishan">Message</button>
        </section>
      </header>
      <main>
        <section id="initial-profile-hero">
          <div>
            <h2>Kishan Dobariya</h2>
            <p>Team Lead | Senior Flutter Developer</p>
            <a href="/overlay/contact-info/">Contact info</a>
            <div>
              <button aria-label="Invite Kishan to connect">Connect</button>
              <button aria-label="Message Kishan">Message</button>
            </div>
          </div>
        </section>
      </main>
    `;

    expect(findPrimaryProfileTopCardRoot('kishan-dobariya')).toBe(
      document.querySelector('#initial-profile-hero > div')
    );
    expect(findProfileTopCardRoot('kishan-dobariya')).toBe(document.querySelector('#sticky-profile-header'));
    expect(extractProfileData()).toMatchObject({
      linkedinUsername: 'kishan-dobariya',
      displayName: 'Kishan Dobariya',
      headline: 'Team Lead | Senior Flutter Developer',
    });
  });

  it('does not treat a profile suggestion in the right rail as the primary profile card', () => {
    window.history.pushState({}, '', '/in/punit-chawla/');
    document.body.innerHTML = `
      <main>
        <div class="scaffold-layout__main">
          <section id="primary-profile-card">
            <h1>Punit Chawla</h1>
            <a href="/overlay/contact-info/">Contact info</a>
            <button aria-label="Follow Punit">Follow</button>
            <button aria-label="Message Punit">Message</button>
          </section>
        </div>
        <aside class="scaffold-layout__aside">
          <section id="suggested-profile-card">
            <h2>Another Person</h2>
            <button aria-label="Follow Another Person">Follow</button>
            <button aria-label="Message Another Person">Message</button>
          </section>
        </aside>
      </main>
    `;

    expect(findPrimaryProfileTopCardRoot('punit-chawla')).toBe(document.querySelector('#primary-profile-card'));
  });

  it('recognizes the current LinkedIn toolbar even when it uses paragraphs instead of headings', () => {
    window.history.pushState({}, '', '/in/prashantrathi1/');
    document.body.innerHTML = `
      <main>
        <div class="scaffold-layout__main">
          <section id="primary-profile-card">
            <p>Prashant Rathi</p>
            <a href="/overlay/contact-info/">Contact info</a>
            <button aria-label="Follow Prashant Rathi">Follow</button>
          </section>
        </div>
      </main>
      <div id="sticky-profile-toolbar" role="toolbar">
        <a href="https://www.linkedin.com/in/prashantrathi1/">
          <p>Prashant Rathi</p>
        </a>
        <a href="/messaging/compose/?recipient=profile">Message</a>
        <button aria-label="Follow Prashant Rathi">Follow</button>
      </div>
      <aside>
        <section id="profile-suggestion">
          <h2>People you may know</h2>
          <button aria-label="Connect with another person">Connect</button>
        </section>
      </aside>
    `;

    const primaryCard = findPrimaryProfileTopCardRoot('prashantrathi1');
    expect(primaryCard).toBe(document.querySelector('#primary-profile-card'));
    expect(findProfileTopCardRoot('prashantrathi1', primaryCard)).toBe(
      document.querySelector('#sticky-profile-toolbar')
    );
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

    expect(findPrimaryProfileTopCardRoot()).toBeNull();
    expect(extractProfileData()).toBeNull();
  });
});
