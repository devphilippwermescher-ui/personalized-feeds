import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closePlanModal, openPlanModal } from '../plan-modal';

describe('plan modal', () => {
  beforeEach(() => {
    closePlanModal();
    document.body.innerHTML = '';
  });

  it('explains the Free limit and marks Pro as in development', () => {
    openPlanModal({ plan: 'free', context: 'feeds' });

    expect(document.body.textContent).toContain('Create unlimited feeds with Pro');
    expect(document.body.textContent).toContain('The Free plan includes up to 3 custom feeds');
    expect(document.body.textContent).toContain('Complete Profile Visitors');
    expect(document.querySelector('.mfp-plan-cta')?.textContent).toBe('In development');
  });

  it('shows a local development notice without opening a tab or sending a billing message', () => {
    const sendMessage = vi.fn();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    openPlanModal({ plan: 'free', context: 'members' });
    document.querySelector<HTMLButtonElement>('.mfp-plan-cta')?.click();

    expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('currently in development');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('closes from Escape without leaving the overlay behind', () => {
    openPlanModal({ plan: 'free', context: 'sharing' });
    const overlay = document.getElementById('mfp-plan-modal-overlay');

    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('mfp-plan-modal-overlay')).toBeNull();
  });
});
