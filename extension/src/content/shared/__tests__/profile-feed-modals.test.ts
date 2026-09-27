import { beforeEach, describe, expect, it } from 'vitest';
import { ensureProfileFeedModals } from '../profile-feed-modals';

describe('profile feed modal shells', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the existing Add to Feed DOM contract on the shared modal shell', () => {
    ensureProfileFeedModals();

    const overlay = document.getElementById('pf-feed-modal-overlay');
    const dialog = document.getElementById('pf-feed-modal');

    expect(overlay?.className).toBe('lfs-modal-overlay pf-feed-modal-overlay');
    expect(overlay?.style.display).toBe('none');
    expect(overlay?.dataset.modalVariant).toBe('default');
    expect(dialog?.className).toBe('lfs-modal lfs-modal--md pf-feed-modal');
    expect(document.querySelector('#pf-feed-modal-body .pf-feed-modal-loading')).not.toBeNull();
    expect(document.getElementById('pf-feed-modal-create')?.textContent).toContain('Create new feed');
  });

  it('keeps the existing Create Feed controls and color choices', () => {
    ensureProfileFeedModals();

    const overlay = document.getElementById('pf-create-feed-overlay');
    const nameInput = document.getElementById('pf-create-feed-name') as HTMLInputElement | null;

    expect(overlay?.className).toBe('lfs-modal-overlay pf-create-feed-overlay');
    expect(overlay?.dataset.modalVariant).toBe('form');
    expect(overlay?.querySelector('.pf-create-feed-modal')).not.toBeNull();
    expect(nameInput?.placeholder).toContain('Feed name');
    expect(overlay?.querySelectorAll('.pf-color-option')).toHaveLength(6);
    expect(overlay?.querySelectorAll('.pf-color-option.active')).toHaveLength(1);
    expect(document.getElementById('pf-create-feed-submit')?.textContent).toContain('Create & Add Profile');
  });

  it('does not duplicate modal overlays and preserves backdrop closing', () => {
    ensureProfileFeedModals();
    ensureProfileFeedModals();

    expect(document.querySelectorAll('#pf-feed-modal-overlay')).toHaveLength(1);
    expect(document.querySelectorAll('#pf-create-feed-overlay')).toHaveLength(1);

    const overlay = document.getElementById('pf-feed-modal-overlay') as HTMLElement;
    overlay.style.display = 'flex';
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(overlay.style.display).toBe('none');
  });
});
