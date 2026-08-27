import { beforeEach, describe, expect, it } from 'vitest';
import { closePlanModal, openPlanModal } from '../plan-modal';

describe('plan modal', () => {
  beforeEach(() => {
    closePlanModal();
    document.body.innerHTML = '';
  });

  it('explains both plans without showing a redundant current-plan block', () => {
    openPlanModal({ plan: 'free', context: 'manage' });

    expect(document.querySelector('.mfp-current-plan')).toBeNull();
    expect(document.body.textContent).toContain('Complete Profile Visitors');
    expect(document.body.textContent).toContain('private-mode views, and recruiter insights');
    expect(document.body.textContent).toContain('myFeedPilot Free');
    expect(document.body.textContent).toContain('up to 10 visible profile visitors');
    expect(document.body.textContent).not.toContain('Full existing workspace');

    openPlanModal({ plan: 'free', context: 'feeds' });

    expect(document.body.textContent).toContain('Create unlimited feeds with Pro');
  });

  it('closes from Escape without leaving the overlay behind', () => {
    openPlanModal({ plan: 'free', context: 'members' });
    const overlay = document.getElementById('mfp-plan-modal-overlay');

    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('mfp-plan-modal-overlay')).toBeNull();
  });

  it('keeps Pro management separate from the future checkout action', () => {
    openPlanModal({ plan: 'pro', context: 'manage' });
    const cta = document.querySelector<HTMLButtonElement>('.mfp-plan-cta');

    cta?.click();

    expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('Lemon Squeezy customer portal');
  });
});
