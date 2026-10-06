import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closePlanModal, openPlanModal } from '../plan-modal';

const sendMessage = vi.fn();

describe('plan modal', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'PLAN_GET') {
        return { success: true, plan: 'pro', subscription: { status: 'active', billingInterval: 'annual' } };
      }
      return { success: true };
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    vi.spyOn(window, 'open').mockReturnValue(null);
    closePlanModal();
    document.body.innerHTML = '';
  });

  it('explains both plans without showing a redundant current-plan block', () => {
    openPlanModal({ plan: 'free', context: 'feeds' });

    expect(document.querySelector('.mfp-current-plan')).toBeNull();
    expect(document.body.textContent).toContain('Complete Profile Visitors');
    expect(document.body.textContent).toContain('private-mode views, and recruiter insights');
    expect(document.body.textContent).toContain('myFeedPilot Free');
    expect(document.body.textContent).toContain('up to 10 visible profile visitors');
    expect(document.body.textContent).not.toContain('Full existing workspace');
    expect(document.querySelector('.mfp-plan-star')?.textContent).toBe('★');
    expect(document.querySelector('.mfp-plan-header > .mfp-plan-close svg')).not.toBeNull();
    expect(document.querySelector('.mfp-plan-scroll > .mfp-plan-hero')).not.toBeNull();

    openPlanModal({ plan: 'free', context: 'members' });
    expect(document.body.textContent).toContain('Add unlimited people with Pro');
    expect(document.body.textContent).toContain('up to 10 people in each feed');

    openPlanModal({ plan: 'free', context: 'sharing' });
    expect(document.body.textContent).toContain('Share without limits with Pro');
  });

  it('confirms opening the pricing flow only after the background succeeds', async () => {
    openPlanModal({ plan: 'free', context: 'feeds' });
    document.querySelector<HTMLButtonElement>('.mfp-plan-cta')?.click();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'BILLING_OPEN_PRICING' });
    await vi.waitFor(() => {
      expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('Pricing opened');
    });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'BILLING_OPEN_CHECKOUT' }));
  });

  it('shows the background error instead of claiming that pricing opened', async () => {
    sendMessage.mockResolvedValueOnce({ success: false, error: 'No pricing connection' });
    openPlanModal({ plan: 'free', context: 'feeds' });
    document.querySelector<HTMLButtonElement>('.mfp-plan-cta')?.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('No pricing connection');
    });
  });

  it('closes from Escape without leaving the overlay behind', () => {
    openPlanModal({ plan: 'free', context: 'members' });
    const overlay = document.getElementById('mfp-plan-modal-overlay');
    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('mfp-plan-modal-overlay')).toBeNull();
  });

  it('opens the billing portal for an active Pro subscription', async () => {
    openPlanModal({ plan: 'pro', context: 'members' });
    const cta = document.querySelector<HTMLButtonElement>('.mfp-plan-cta');
    expect(cta?.textContent).toBe('Manage billing');
    cta?.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('Billing management opened');
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'BILLING_OPEN_PORTAL' });
  });
});
