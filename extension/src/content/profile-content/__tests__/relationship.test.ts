import { beforeEach, describe, expect, it } from 'vitest';
import { detectCurrentProfileRelationship } from '../logic/relationship';

describe('detectCurrentProfileRelationship', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
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
});
