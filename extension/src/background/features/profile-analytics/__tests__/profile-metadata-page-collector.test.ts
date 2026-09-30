import { afterEach, describe, expect, it } from 'vitest';
import { collectLinkedInProfileMetadataFromCurrentPage } from '../api/profile-metadata-page-collector';

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

describe('already-open LinkedIn profile metadata collector', () => {
  it('reads the location beside Contact info on the matching own profile', () => {
    window.history.replaceState({}, '', '/in/example-user/');
    document.body.innerHTML = `
      <main>
        <h1>Example User</h1>
        <p>Engineer at Kharkiv University</p>
        <div>
          <p>Kharkiv, Ukraine</p>
          <p>·</p>
          <p><a href="#">Contact info</a></p>
        </div>
      </main>
    `;

    expect(collectLinkedInProfileMetadataFromCurrentPage('example-user')).toMatchObject({
      linkedinUsername: 'example-user',
      location: 'Kharkiv, Ukraine',
    });
  });

  it('does not read metadata from another member profile', () => {
    window.history.replaceState({}, '', '/in/someone-else/');
    document.body.innerHTML = '<main><p>Wrong City</p><a href="#">Contact info</a></main>';

    expect(collectLinkedInProfileMetadataFromCurrentPage('example-user')).toBeNull();
  });
});
