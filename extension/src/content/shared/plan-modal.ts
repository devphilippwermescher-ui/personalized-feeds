import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { AppPlan, BillingSubscription } from 'shared/plans';
import type { BillingCurrency } from 'shared/types';
import { DEFAULT_BILLING_CURRENCY } from 'shared/user-profile-preferences';
import type { ProBillingInterval } from 'shared/subscription-config';
import { Modal } from 'shared/ui/modal';
import { getPlanSnapshot, openCheckout, openCustomerPortal } from '../subscription/services/billing-service';
import { renderPlanStarIcon } from './plan-star';
import { closeProfilePreferencesModal, openProfilePreferencesModal } from '../profile-preferences/public';
import { loadProfilePreferences } from '../profile-preferences/services/profile-preferences-service';
import { injectPlanModalStyles } from './plan-modal-styles';

export type PlanModalContext = 'manage' | 'feeds' | 'members';

const MODAL_ID = 'mfp-plan-modal-overlay';
const MODAL_HOST_ID = 'mfp-plan-modal-react-root';
const ACTIVATION_POLL_INTERVAL_MS = 5000;
const ACTIVATION_POLL_ATTEMPTS = 24;
let planModalRoot: Root | null = null;
let planModalHost: HTMLElement | null = null;

function getContextCopy(context: PlanModalContext): { title: string; description: string } {
  if (context === 'feeds') {
    return {
      title: 'Create unlimited feeds with Pro',
      description: 'The Free plan includes up to 3 custom feeds. Upgrade to keep organizing without limits.',
    };
  }

  if (context === 'members') {
    return {
      title: 'Add unlimited people with Pro',
      description: 'The Free plan includes up to 15 people in each feed. Upgrade to keep growing this feed.',
    };
  }

  return {
    title: 'Get more from LinkedIn with Pro',
    description: 'Unlock complete visitor history and unlimited personalized feeds.',
  };
}

export function closePlanModal(): void {
  planModalRoot?.unmount();
  planModalHost?.remove();
  planModalRoot = null;
  planModalHost = null;
  document.getElementById(MODAL_ID)?.remove();
  document.getElementById(MODAL_HOST_ID)?.remove();
}

function formatBillingDate(value?: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function renderSubscriptionSummary(subscription: BillingSubscription | null | undefined): string {
  if (!subscription) {
    return '<strong>Pro plan active</strong><span>Billing details are not available yet.</span>';
  }

  const interval = subscription.billingInterval === 'annual' ? 'Annual' : 'Monthly';
  const isEnding = subscription.status === 'cancelled';
  const date = formatBillingDate(isEnding ? subscription.endsAt : subscription.renewsAt);
  const timing = isEnding
    ? date
      ? `Pro access remains active until ${date}.`
      : 'The subscription is scheduled to end.'
    : date
      ? `Next billing date: ${date}.`
      : 'Your subscription is active.';

  return `<strong>${interval} Pro plan</strong><span>${timing}</span>`;
}

async function hydrateSubscriptionSummary(overlay: HTMLElement): Promise<void> {
  const summary = overlay.querySelector<HTMLElement>('.mfp-plan-current');
  if (!summary) return;

  try {
    const snapshot = await getPlanSnapshot(true);
    if (!overlay.isConnected) return;
    summary.innerHTML = renderSubscriptionSummary(snapshot.subscription);
  } catch {
    if (overlay.isConnected) {
      summary.innerHTML = '<strong>Pro plan active</strong><span>Billing details could not be loaded.</span>';
    }
  }
}

async function waitForProActivation(overlay: HTMLElement, context: PlanModalContext): Promise<void> {
  for (let attempt = 0; attempt < ACTIVATION_POLL_ATTEMPTS && overlay.isConnected; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, ACTIVATION_POLL_INTERVAL_MS));
    if (!overlay.isConnected) return;

    try {
      const snapshot = await getPlanSnapshot(true);
      if (snapshot.success && snapshot.plan === 'pro') {
        openPlanModal({ plan: 'pro', context });
        return;
      }
    } catch {
      // A later poll can recover from a transient auth or Firestore failure.
    }
  }
}

function applyBillingCurrency(overlay: HTMLElement, currency: BillingCurrency): void {
  const symbol = currency === 'EUR' ? '€' : '$';
  const values: Record<string, string> = {
    monthly: `${symbol}19`,
    annualMonthly: `${symbol}13`,
    annualTotal: `${symbol}156 billed yearly`,
  };

  Object.entries(values).forEach(([key, value]) => {
    const element = overlay.querySelector<HTMLElement>(`[data-plan-price="${key}"]`);
    if (element) element.textContent = value;
  });
}

export function openPlanModal(options: { plan: AppPlan; context: PlanModalContext }): void {
  injectPlanModalStyles(MODAL_ID, 'mfp-plan-modal-styles');
  closePlanModal();
  closeProfilePreferencesModal();

  const copy =
    options.plan === 'pro'
      ? {
          title: 'Your myFeedPilot Pro plan',
          description: 'Review your plan here, then open secure billing management when needed.',
        }
      : getContextCopy(options.context);
  let selectedBillingInterval: ProBillingInterval = 'annual';
  let selectedBillingCurrency: BillingCurrency = DEFAULT_BILLING_CURRENCY;
  const billingSelector =
    options.plan === 'free'
      ? `
      <div class="mfp-plan-billing" role="group" aria-label="Choose billing period">
        <button class="mfp-plan-billing-option" type="button" data-billing-interval="monthly" aria-pressed="false">
          <span class="mfp-plan-billing-name">Monthly</span>
          <span class="mfp-plan-billing-price"><strong data-plan-price="monthly">€19</strong><span>/ month</span></span>
          <span class="mfp-plan-billing-detail">Billed monthly</span>
        </button>
        <button class="mfp-plan-billing-option is-selected" type="button" data-billing-interval="annual" aria-pressed="true">
          <span class="mfp-plan-billing-save">Save 32%</span>
          <span class="mfp-plan-billing-name">Annual</span>
          <span class="mfp-plan-billing-price"><strong data-plan-price="annualMonthly">€13</strong><span>/ month</span></span>
          <span class="mfp-plan-billing-detail" data-plan-price="annualTotal">€156 billed yearly</span>
        </button>
      </div>
      <p class="mfp-plan-currency-note">
        Prices are shown in your preferred currency. Change it in
        <button class="mfp-plan-currency-link" type="button">Profile &amp; billing</button>.
      </p>
    `
      : '';
  const bodyHtml = `
        <div class="mfp-plan-hero">
          <div class="mfp-plan-star-wrap">
            ${renderPlanStarIcon({ className: 'mfp-plan-star' })}
          </div>
          <h2 id="mfp-plan-title">${copy.title}</h2>
          <p class="mfp-plan-description">${copy.description}</p>
        </div>
        ${billingSelector}
        ${options.plan === 'pro' ? '<div class="mfp-plan-current"><strong>Pro plan active</strong><span>Loading billing details…</span></div>' : ''}
        <div class="mfp-plan-benefits">
          <div class="mfp-plan-benefit"><div class="mfp-plan-benefit-icon">◎</div><div><strong>Complete Profile Visitors</strong><span>Collect all visible visitors, private-mode views, and recruiter insights available from LinkedIn.</span></div></div>
          <div class="mfp-plan-benefit"><div class="mfp-plan-benefit-icon">≡</div><div><strong>Unlimited custom feeds</strong><span>Create as many focused feeds as you need for prospects, partners, and industry leaders.</span></div></div>
          <div class="mfp-plan-benefit"><div class="mfp-plan-benefit-icon">＋</div><div><strong>Unlimited people per feed</strong><span>Build complete prospect and relationship lists with as many people in each feed as you need.</span></div></div>
        </div>
        <div class="mfp-plan-about-label">About myFeedPilot plans</div>
        <div class="mfp-plan-about">
          <p><strong>myFeedPilot Free</strong> lets you save and track up to 10 visible profile visitors—more identifiable visitor profiles than LinkedIn Free normally shows at once—and organize people in custom feeds.</p>
          <p><strong>myFeedPilot Pro</strong> removes those limits and adds complete visitor collection, including private-mode views and recruiter insights, so your network tracking can grow with you.</p>
        </div>
        <div class="mfp-plan-actions">
          <button class="mfp-plan-cta" type="button">${options.plan === 'pro' ? 'Manage billing' : 'Upgrade to Pro'}</button>
          <div class="mfp-plan-note" aria-live="polite"></div>
        </div>
  `;

  planModalHost = document.createElement('div');
  planModalHost.id = MODAL_HOST_ID;
  document.body.appendChild(planModalHost);
  planModalRoot = createRoot(planModalHost);
  flushSync(() => {
    planModalRoot?.render(
      createElement(Modal, {
        title: copy.title,
        variant: 'billing',
        tone: options.plan === 'pro' ? 'success' : 'primary',
        size: 'lg',
        titleId: 'mfp-plan-title',
        onClose: () => closePlanModal(),
        closeOnBackdrop: false,
        closeOnEscape: false,
        portalTarget: document.body,
        overlayId: MODAL_ID,
        dialogAs: 'section',
        bodyHtml,
        classNames: {
          overlay: 'mfp-plan-overlay',
          dialog: 'mfp-plan-modal',
          body: 'mfp-plan-scroll',
        },
        header: createElement(
          'div',
          { className: 'mfp-plan-header' },
          createElement(
            'button',
            { className: 'mfp-plan-close', type: 'button', 'aria-label': 'Close' },
            createElement(
              'svg',
              {
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: '2.5',
                strokeLinecap: 'round',
                'aria-hidden': true,
              },
              createElement('path', { d: 'M6 6l12 12M18 6 6 18' })
            )
          )
        ),
      })
    );
  });

  const overlay = document.getElementById(MODAL_ID);
  if (!overlay) {
    closePlanModal();
    return;
  }

  const close = (): void => closePlanModal();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  overlay.querySelector('.mfp-plan-close')?.addEventListener('click', close);
  overlay.querySelector('.mfp-plan-currency-link')?.addEventListener('click', () => {
    closePlanModal();
    void openProfilePreferencesModal().catch(() => openPlanModal(options));
  });
  const cta = overlay.querySelector<HTMLButtonElement>('.mfp-plan-cta');
  overlay.querySelectorAll<HTMLButtonElement>('[data-billing-interval]').forEach((button) => {
    button.addEventListener('click', () => {
      const interval = button.dataset.billingInterval;
      if (interval !== 'monthly' && interval !== 'annual') return;

      selectedBillingInterval = interval;
      overlay.querySelectorAll<HTMLButtonElement>('[data-billing-interval]').forEach((option) => {
        const isSelected = option.dataset.billingInterval === selectedBillingInterval;
        option.classList.toggle('is-selected', isSelected);
        option.setAttribute('aria-pressed', String(isSelected));
      });
    });
  });
  cta?.addEventListener('click', () => {
    const note = overlay.querySelector<HTMLElement>('.mfp-plan-note');
    if (!cta || cta.disabled) return;
    const originalLabel = cta.textContent || '';
    cta.disabled = true;
    cta.textContent = options.plan === 'pro' ? 'Opening billing…' : 'Opening secure checkout…';

    void (
      options.plan === 'pro' ? openCustomerPortal() : openCheckout(selectedBillingInterval, selectedBillingCurrency)
    )
      .then(() => {
        if (!overlay.isConnected) return;
        if (note) {
          note.textContent =
            options.plan === 'pro'
              ? 'Billing management opened in a new tab.'
              : 'Checkout opened. Pro activates automatically after payment is confirmed.';
        }
        if (options.plan === 'free') {
          void waitForProActivation(overlay, options.context);
        }
      })
      .catch((error) => {
        if (overlay.isConnected && note) {
          note.textContent = error instanceof Error ? error.message : 'Unable to open billing right now.';
        }
      })
      .finally(() => {
        if (overlay.isConnected) {
          cta.disabled = false;
          cta.textContent = originalLabel;
        }
      });
  });

  if (options.plan === 'free') {
    void loadProfilePreferences()
      .then(({ preferences }) => {
        if (!overlay.isConnected) return;
        selectedBillingCurrency = preferences.billingCurrency;
        applyBillingCurrency(overlay, selectedBillingCurrency);
      })
      .catch(() => {
        selectedBillingCurrency = DEFAULT_BILLING_CURRENCY;
      });
  }

  if (options.plan === 'pro') void hydrateSubscriptionSummary(overlay);
  overlay.querySelector<HTMLElement>('.mfp-plan-close')?.focus();
}
