import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectCurrentProfileRelationship,
  syncCurrentProfileViewerStatus,
} from '../logic/relationship';
import type { ProfileData } from '../types';

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    linkedinUrl: 'https://www.linkedin.com/in/yuliia-biliavtseva/',
    linkedinUsername: 'yuliia-biliavtseva',
    displayName: 'Yuliia Biliavtseva',
    ...overrides,
  };
}

describe('detectCurrentProfileRelationship', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/in/yuliia-biliavtseva/');
    document.body.innerHTML = '';
  });

  it('reads a Pending link from the current profile card instead of Connect from another profile-like section', () => {
    document.body.innerHTML = `
      <section data-member-id="unrelated-member">
        <h2>Suggested Person</h2>
        <button aria-label="Invite Suggested Person to connect">Connect</button>
      </section>
      <section componentkey="Topcard-main">
        <h1>Yuliia Biliavtseva</h1>
        <a href="/in/yuliia-biliavtseva/">Yuliia Biliavtseva</a>
        <a role="button" aria-label="Pending, click to withdraw invitation">Pending</a>
        <a role="button" aria-label="Message Yuliia">Message</a>
      </section>
    `;

    expect(detectCurrentProfileRelationship(profile())).toMatchObject({
      status: 'pending',
      canConnect: false,
      canMessage: true,
    });
  });

  it('does not mark Connect as authoritative when the profile is already followed', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Invite Yuliia to connect">Connect</button>
        <button aria-label="Following Yuliia">Following</button>
      </section>
    `;

    expect(detectCurrentProfileRelationship(null)).toMatchObject({
      canConnect: true,
      canFollow: true,
      isFollowing: true,
    });
    expect(detectCurrentProfileRelationship(null).status).toBeUndefined();
  });

  it('does not write isFollowing=false just because the profile top card only shows Connect', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Invite Yuliia to connect">Connect</button>
      </section>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBe('connect');
    expect(relationship.canConnect).toBe(true);
    expect(relationship.isFollowing).toBeUndefined();
    expect(relationship.canFollow).toBeUndefined();
  });

  it('writes isFollowing=false when the profile explicitly shows Follow', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Mykhailo Blokhin</h1>
        <button aria-label="Invite Mykhailo to connect">Connect</button>
      </section>
      <div role="menu">
        <button aria-label="Follow Mykhailo">Follow</button>
      </div>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBe('connect');
    expect(relationship.canConnect).toBe(true);
    expect(relationship.canFollow).toBe(true);
    expect(relationship.isFollowing).toBe(false);
  });

  it('keeps isFollowing=true when an open profile menu shows Following alongside hidden Follow signals', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yuliia Biliavtseva</h1>
        <button aria-label="Invite Yuliia to connect">Connect</button>
        <button aria-label="Follow Yuliia" hidden>Follow</button>
      </section>
      <div role="menu">
        <button aria-label="Following Yuliia">Following</button>
      </div>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBeUndefined();
    expect(relationship.canConnect).toBe(true);
    expect(relationship.canFollow).toBe(true);
    expect(relationship.isFollowing).toBe(true);
  });

  it('treats a visible 2nd-degree + Follow button as not followed, not connected', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Andriy Kolodiy</h1>
        <span class="dist-value">2nd</span>
        <button aria-label="Follow Andriy">+ Follow</button>
        <button aria-label="Message Andriy">Message</button>
      </section>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBe('connect');
    expect(relationship.canMessage).toBe(true);
    expect(relationship.canFollow).toBe(true);
    expect(relationship.isFollowing).toBe(false);
  });

  it('treats a visible 2nd-degree Following button as followed, not connected', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Andriy Kolodiy</h1>
        <span class="dist-value">2nd</span>
        <button aria-label="Following Andriy">Following</button>
        <button aria-label="Message Andriy">Message</button>
      </section>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBe('following');
    expect(relationship.canMessage).toBe(true);
    expect(relationship.canFollow).toBe(true);
    expect(relationship.isFollowing).toBe(true);
  });

  it('marks the current profile as Premium from a scoped LinkedIn premium badge icon', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Yevhen Romanenko</h1>
        <span class="dist-value">1st</span>
        <button aria-label="Message Yevhen">Message</button>
        <li-icon type="linkedin-bug"></li-icon>
      </section>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBe('connected');
    expect(relationship.isPremium).toBe(true);
  });

  it('does not mark Premium from unrelated page chrome outside the profile top card', () => {
    document.body.innerHTML = `
      <section class="pv-top-card">
        <h1>Regular Person</h1>
        <span class="dist-value">1st</span>
        <button aria-label="Message Regular Person">Message</button>
      </section>
      <a title="LinkedIn Premium">Try Premium</a>
    `;

    const relationship = detectCurrentProfileRelationship(null);

    expect(relationship.status).toBe('connected');
    expect(relationship.isPremium).toBeUndefined();
  });

  it('persists native LinkedIn Pending and asks every sidebar tab to refresh', async () => {
    document.body.innerHTML = `
      <section componentkey="Topcard-main">
        <h1>Yuliia Biliavtseva</h1>
        <a href="/in/yuliia-biliavtseva/">Yuliia Biliavtseva</a>
        <a role="button" aria-label="Pending, click to withdraw invitation">Pending</a>
      </section>
    `;
    const sendMessageToBackground = vi.fn().mockResolvedValue({ success: true });

    await syncCurrentProfileViewerStatus({
      getCurrentProfileData: () => profile(),
      sendMessageToBackground,
    });

    expect(sendMessageToBackground).toHaveBeenCalledOnce();
    expect(sendMessageToBackground).toHaveBeenCalledWith({
      type: 'PROFILE_VIEWERS_UPDATE',
      viewerId: 'yuliia-biliavtseva',
      updates: expect.objectContaining({
        status: 'pending',
        canConnect: false,
        statusResolvedAt: expect.any(Number),
      }),
      notifyProfileViewersChanged: true,
    });
  });

  it('does not make an unresolved stored status fresh for another hour', async () => {
    document.body.innerHTML = '<main><h1>Yuliia Biliavtseva</h1></main>';
    const sendMessageToBackground = vi.fn().mockResolvedValue({ success: true });

    await syncCurrentProfileViewerStatus({
      getCurrentProfileData: () => profile({ connectionDegree: '2nd' }),
      sendMessageToBackground,
    });

    const message = sendMessageToBackground.mock.calls[0]?.[0] as {
      updates?: Record<string, unknown>;
    };
    expect(message.updates).toMatchObject({ connectionDegree: '2nd' });
    expect(message.updates).not.toHaveProperty('statusResolvedAt');
  });
});
