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
    expect(document.querySelector('.mfp-plan-star')?.textContent).toBe('★');
    expect(document.querySelector('.mfp-plan-header > .mfp-plan-close svg')).not.toBeNull();
    expect(document.querySelector('.mfp-plan-scroll > .mfp-plan-hero')).not.toBeNull();

    openPlanModal({ plan: 'free', context: 'feeds' });

    expect(document.body.textContent).toContain('Create unlimited feeds with Pro');
  });

  it('selects the discounted annual billing period by default', () => {
    openPlanModal({ plan: 'free', context: 'manage' });

    const annual = document.querySelector<HTMLButtonElement>('[data-billing-interval="annual"]');
    const monthly = document.querySelector<HTMLButtonElement>('[data-billing-interval="monthly"]');

    expect(annual?.classList.contains('is-selected')).toBe(true);
    expect(annual?.getAttribute('aria-pressed')).toBe('true');
    expect(monthly?.getAttribute('aria-pressed')).toBe('false');
    expect(monthly?.textContent).toContain('€19');
    expect(annual?.textContent).toContain('€156 billed yearly');
    expect(annual?.textContent).toContain('Save 32%');
    expect(document.querySelector('.mfp-plan-currency-note')?.textContent).toContain('Profile & billing');
    expect(document.querySelector('.mfp-plan-cta')?.textContent).toBe('Upgrade to Pro');
  });

  it('updates the selected period and opens Monthly checkout through the background', async () => {
    openPlanModal({ plan: 'free', context: 'manage' });
    const monthly = document.querySelector<HTMLButtonElement>('[data-billing-interval="monthly"]');
    const annual = document.querySelector<HTMLButtonElement>('[data-billing-interval="annual"]');

    monthly?.click();

    expect(monthly?.classList.contains('is-selected')).toBe(true);
    expect(monthly?.getAttribute('aria-pressed')).toBe('true');
    expect(annual?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.mfp-plan-cta')?.textContent).toBe('Upgrade to Pro');

    document.querySelector<HTMLButtonElement>('.mfp-plan-cta')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('Checkout opened');
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'BILLING_OPEN_CHECKOUT', interval: 'monthly' });
  });

  it('restores a saved USD preference instead of the EUR default', async () => {
    sendMessage.mockImplementation(async (message: { type?: string }) => {
      if (message.type === 'PROFILE_PREFERENCES_GET') {
        return {
          success: true,
          preferences: { displayName: '', avatarDataUrl: '', billingCurrency: 'USD' },
          user: {
            userId: 'user-1',
            displayName: 'Test User',
            email: 'test@example.com',
            photoURL: '',
          },
        };
      }
      return { success: true };
    });

    openPlanModal({ plan: 'free', context: 'manage' });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-plan-price="monthly"]')?.textContent).toBe('$19');
      expect(document.querySelector('[data-plan-price="annualTotal"]')?.textContent).toBe('$156 billed yearly');
    });
  });

  it('closes from Escape without leaving the overlay behind', () => {
    openPlanModal({ plan: 'free', context: 'members' });
    const overlay = document.getElementById('mfp-plan-modal-overlay');

    overlay?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.getElementById('mfp-plan-modal-overlay')).toBeNull();
  });

  it('keeps Pro management inside the modal and opens billing from its action', async () => {
    openPlanModal({ plan: 'pro', context: 'manage' });
    const cta = document.querySelector<HTMLButtonElement>('.mfp-plan-cta');

    expect(document.querySelector('.mfp-plan-billing')).toBeNull();
    expect(cta?.textContent).toBe('Manage billing');
    cta?.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.mfp-plan-note')?.textContent).toContain('Billing management opened');
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'BILLING_OPEN_PORTAL' });
  });
});
