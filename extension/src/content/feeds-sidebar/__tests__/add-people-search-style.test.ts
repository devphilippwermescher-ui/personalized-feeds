import { beforeEach, describe, expect, it } from 'vitest';
import { EDITORSEARCH_CSS } from '../styles/editor-search';

describe('Add People search field styles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('keeps room for the search icon when shared input styles load later', () => {
    const featureStyles = document.createElement('style');
    featureStyles.textContent = EDITORSEARCH_CSS;
    document.head.appendChild(featureStyles);

    const laterSharedStyles = document.createElement('style');
    laterSharedStyles.textContent = '.lfs-input { padding: 13px 16px !important; }';
    document.head.appendChild(laterSharedStyles);

    document.body.innerHTML = `
      <div class="lfa-feed-search-input-wrap">
        <svg></svg>
        <input class="lfs-input lfa-feed-modal-input--search" />
      </div>
    `;

    const input = document.querySelector<HTMLInputElement>('input');
    expect(input && getComputedStyle(input).paddingLeft).toBe('42px');
  });
});
