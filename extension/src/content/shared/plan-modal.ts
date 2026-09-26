import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { AppPlan, BillingSubscription } from 'shared/plans';
import { Modal } from 'shared/ui/modal';
import { getPlanSnapshot, openCustomerPortal } from '../subscription/services/billing-service';
import { openPricingPage } from '../subscription/services/pricing-page';
import { renderPlanStarIcon } from './plan-star';
import { closeProfilePreferencesModal } from '../profile-preferences/public';
import { injectPlanModalStyles } from './plan-modal-styles';

export type PlanModalContext = 'feeds' | 'members' | 'sharing';

const MODAL_ID = 'mfp-plan-modal-overlay';
const MODAL_HOST_ID = 'mfp-plan-modal-react-root';
let planModalRoot: Root | null = null;
let planModalHost: HTMLElement | null = null;

function getContextCopy(context: PlanModalContext): { title: string; description: string } {
  if (context === 'members') {
    return {
      title: 'Add unlimited people with Pro',
      description: 'The Free plan includes up to 10 people in each feed. Upgrade to keep growing this feed.',
    };
  }

  if (context === 'sharing') {
    return {
      title: 'Share without limits with Pro',
      description: 'Share and receive more personalized feeds without Free plan sharing limits.',
    };
  }

  return {
    title: 'Create unlimited feeds with Pro',
    description: 'The Free plan includes up to 3 custom feeds. Upgrade to keep organizing without limits.',
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
  if (subscription.status === 'past_due') {
    return `<strong>${interval} Pro plan — payment needs attention</strong><span>Your Pro access remains active while Lemon Squeezy retries the payment. Update your payment method to avoid interruption.</span>`;
  }
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
    if (snapshot.subscription?.status === 'past_due') {
      const cta = overlay.querySelector<HTMLButtonElement>('.mfp-plan-cta');
      if (cta && !cta.disabled) cta.textContent = 'Update payment';
    }
  } catch {
    if (overlay.isConnected) {
      summary.innerHTML = '<strong>Pro plan active</strong><span>Billing details could not be loaded.</span>';
    }
  }
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
  const bodyHtml = `
        <div class="mfp-plan-hero">
          <div class="mfp-plan-star-wrap">
            ${renderPlanStarIcon({ className: 'mfp-plan-star' })}
          </div>
          <h2 id="mfp-plan-title">${copy.title}</h2>
          <p class="mfp-plan-description">${copy.description}</p>
        </div>
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
  const cta = overlay.querySelector<HTMLButtonElement>('.mfp-plan-cta');
  cta?.addEventListener('click', () => {
    const note = overlay.querySelector<HTMLElement>('.mfp-plan-note');
    if (!cta || cta.disabled) return;

    if (options.plan === 'free') {
      openPricingPage();
      if (note) note.textContent = 'Pricing opened in a new tab.';
      return;
    }

    const originalLabel = cta.textContent || '';
    cta.disabled = true;
    cta.textContent = 'Opening billing…';

    void openCustomerPortal()
      .then(() => {
        if (!overlay.isConnected) return;
        if (note) {
          note.textContent = 'Billing management opened in a new tab.';
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

  if (options.plan === 'pro') void hydrateSubscriptionSummary(overlay);
  overlay.querySelector<HTMLElement>('.mfp-plan-close')?.focus();
}
