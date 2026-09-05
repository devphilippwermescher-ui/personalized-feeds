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
    expect(targets[0].degreeElement.className).toBe('msg-thread__profile-header');
    expect(targets[0].insertPosition).toBe('beforeend');
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

  it('finds the profile link in a deeply nested SPA conversation card', () => {
    document.body.innerHTML = `
      <section class="msg-entity-lockup__card">
        <a href="/in/grace-hopper/">Grace Hopper</a>
        <div><div><div><div><div><div><div><div>
          <span class="connection-degree">1st</span>
        </div></div></div></div></div></div></div></div>
      </section>
    `;

    expect(findMessagingProfileTargets(document)[0]?.profile).toMatchObject({
      linkedinUsername: 'grace-hopper',
      displayName: 'Grace Hopper',
      connectionDegree: '1st',
    });
  });

  it('supports the SPA identity row when the degree is a bare text node', () => {
    document.body.innerHTML = `
      <section data-view-name="messaging-profile-card">
        <a aria-label="View Gabriel P Bernes's profile" href="/in/gabriel-p-bernes/">
          Gabriel P Bernes
        </a>
        <div class="identity-row">
          <strong>Gabriel P Bernes</strong>
          <svg aria-label="Verified profile"></svg>
          · 1st
        </div>
        <p>Software Engineer | Mobile</p>
      </section>
    `;

    const target = findMessagingProfileTargets(document)[0];

    expect(target?.insertPosition).toBe('beforeend');
    expect(target?.degreeElement.className).toBe('identity-row');
    expect(target?.profile).toMatchObject({
      linkedinUsername: 'gabriel-p-bernes',
      displayName: 'Gabriel P Bernes',
      connectionDegree: '1st',
    });
  });

  it('recognizes accessible degree labels before visible text is hydrated', () => {
    document.body.innerHTML = `
      <section class="msg-thread__profile-card">
        <a href="/in/ada-lovelace/">Ada Lovelace</a>
        <span aria-label="1st degree connection"></span>
      </section>
    `;

    expect(findMessagingProfileTargets(document)[0]?.profile).toMatchObject({
      linkedinUsername: 'ada-lovelace',
      connectionDegree: '1st',
    });
  });

  it('selects one visible degree target when LinkedIn also renders an accessibility duplicate', () => {
    document.body.innerHTML = `
      <section class="msg-thread__profile-card">
        <div class="identity-row">
          <a href="/in/gabriel-p-bernes/">Gabriel P Bernes</a>
          <span aria-label="1st degree connection"></span>
          <span class="visible-degree">· 1st</span>
        </div>
      </section>
    `;

    const targets = findMessagingProfileTargets(document);

    expect(targets).toHaveLength(1);
    expect(targets[0].degreeElement.className).toBe('identity-row');
    expect(targets[0].insertPosition).toBe('beforeend');
  });

  it('prefers the visible LinkedIn degree even though LinkedIn marks it aria-hidden', () => {
    document.body.innerHTML = `
      <li>
        <div class="msg-s-profile-card msg-s-profile-card-one-to-one">
          <div class="artdeco-entity-lockup">
            <a href="/in/ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8"><img src="avatar.jpg" /></a>
            <div class="artdeco-entity-lockup__content">
              <div class="artdeco-entity-lockup__title display-flex align-items-center">
                <span><a class="profile-card-one-to-one__profile-link" href="/in/ACoAACRPshYBLCHxtTUH4Cl1mCZPtGURwL_hJv8">Gabriel P Bernes</a></span>
                <div class="artdeco-entity-lockup__badge">
                  <span class="a11y-text">1st degree connection</span>
                  <span class="artdeco-entity-lockup__degree" aria-hidden="true">·&nbsp;1st</span>
                </div>
              </div>
              <div class="artdeco-entity-lockup__subtitle">Software Engineer</div>
            </div>
          </div>
        </div>
      </li>
    `;

    const targets = findMessagingProfileTargets(document);

    expect(targets).toHaveLength(1);
    expect(targets[0].degreeElement.className).toContain('artdeco-entity-lockup__title');
    expect(targets[0].insertPosition).toBe('beforeend');
  });
});
