import { describe, expect, it } from 'vitest';

import { isLinkedInProfileUnavailableHtml } from '../profile-page-state';

describe('isLinkedInProfileUnavailableHtml', () => {
  it('detects the LinkedIn flagship 404 marker', () => {
    expect(
      isLinkedInProfileUnavailableHtml(`
        <!doctype html>
        <html>
          <head>
            <meta name="como-pk" content="d_flagship3_404">
          </head>
        </html>
      `)
    ).toBe(true);
  });

  it('detects the visible LinkedIn deleted-page copy', () => {
    expect(
      isLinkedInProfileUnavailableHtml(`
        <main>
          <h1>This page doesn&#x27;t exist</h1>
          <p>Please check your URL or return to LinkedIn home.</p>
        </main>
      `)
    ).toBe(true);
  });

  it('ignores ordinary profile HTML', () => {
    expect(
      isLinkedInProfileUnavailableHtml(`
        <main>
          <button aria-label="Invite Sofia Melnychok to connect">Connect</button>
        </main>
      `)
    ).toBe(false);
  });
});
