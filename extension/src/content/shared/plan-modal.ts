import type { AppPlan, BillingSubscription } from 'shared/plans';
import type { ProBillingInterval } from 'shared/subscription-config';
import { getPlanSnapshot, openCheckout, openCustomerPortal } from '../subscription/services/billing-service';
import { renderPlanStarIcon } from './plan-star';

export type PlanModalContext = 'manage' | 'feeds' | 'members';

const MODAL_ID = 'mfp-plan-modal-overlay';
const STYLE_ID = 'mfp-plan-modal-styles';
const ACTIVATION_POLL_INTERVAL_MS = 5000;
const ACTIVATION_POLL_ATTEMPTS = 24;

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

function injectPlanModalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(35, 28, 15, 0.58);
      backdrop-filter: blur(5px);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #${MODAL_ID} .mfp-plan-modal {
      position: relative;
      width: min(430px, calc(100vw - 32px));
      max-height: min(760px, calc(100vh - 32px));
      overflow: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      border: 1px solid rgba(255, 214, 90, 0.28);
      border-radius: 24px;
      color: #fffaf0;
      background:
        radial-gradient(circle at 50% -7%, rgba(255, 207, 63, 0.34), transparent 37%),
        linear-gradient(180deg, #282013 0%, #17140e 100%);
      box-shadow: 0 32px 90px rgba(35, 25, 7, 0.54), 0 0 0 1px rgba(255, 221, 112, 0.04) inset;
    }
    #${MODAL_ID} .mfp-plan-modal::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    #${MODAL_ID} .mfp-plan-close {
      position: absolute;
      top: 14px;
      left: 14px;
      width: 38px;
      height: 38px;
      border: 1px solid rgba(255, 220, 112, .2);
      border-radius: 50%;
      color: #fff8e7;
      background: rgba(39, 31, 17, .72);
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    #${MODAL_ID} .mfp-plan-hero {
      padding: 54px 28px 24px;
      text-align: center;
    }
    #${MODAL_ID} .mfp-plan-star-wrap {
      width: 96px;
      height: 96px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255, 217, 90, .28);
      border-radius: 32px;
      color: #fff;
      background: linear-gradient(145deg, #ffe16d, #eeb224);
      box-shadow: 0 18px 46px rgba(222, 158, 17, .24), 0 0 34px rgba(255, 217, 90, .08) inset;
      transform: rotate(-7deg);
    }
    #${MODAL_ID} .mfp-plan-star {
      display: block;
      font-size: 58px;
      line-height: 1;
      text-shadow: 0 7px 13px rgba(125, 80, 0, .24);
    }
    #${MODAL_ID} h2 {
      margin: 0 0 10px;
      color: #fffaf0;
      font-size: 25px;
      line-height: 1.2;
    }
    #${MODAL_ID} .mfp-plan-description {
      margin: 0;
      color: #d4c8af;
      font-size: 14px;
      line-height: 1.5;
    }
    #${MODAL_ID} .mfp-plan-benefits {
      margin: 0 22px 18px;
      padding: 4px 16px;
      border: 1px solid rgba(255, 219, 104, .13);
      border-radius: 18px;
      background: rgba(255, 248, 226, .055);
    }
    #${MODAL_ID} .mfp-plan-benefit {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 11px;
      padding: 14px 0;
      border-bottom: 1px solid rgba(255, 220, 112, .1);
    }
    #${MODAL_ID} .mfp-plan-benefit:last-child { border-bottom: 0; }
    #${MODAL_ID} .mfp-plan-benefit-icon {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      color: #473000;
      background: linear-gradient(145deg, #ffe47e, #ffca32);
      box-shadow: 0 7px 16px rgba(206, 145, 8, .18);
      font-size: 17px;
    }
    #${MODAL_ID} .mfp-plan-benefit strong {
      display: block;
      margin-bottom: 3px;
      color: #fffaf0;
      font-size: 14px;
    }
    #${MODAL_ID} .mfp-plan-benefit span {
      color: #c7bda7;
      font-size: 12.5px;
      line-height: 1.4;
    }
    #${MODAL_ID} .mfp-plan-about-label {
      margin: 0 26px 8px;
      color: #a99978;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    #${MODAL_ID} .mfp-plan-about {
      margin: 0 22px 6px;
      padding: 16px;
      border: 1px solid rgba(255, 219, 104, .13);
      border-radius: 18px;
      color: #d4c8af;
      background: rgba(255, 248, 226, .055);
      font-size: 12.5px;
      line-height: 1.5;
    }
    #${MODAL_ID} .mfp-plan-about p {
      margin: 0;
    }
    #${MODAL_ID} .mfp-plan-about p + p {
      margin-top: 11px;
    }
    #${MODAL_ID} .mfp-plan-about strong {
      color: #fffaf0;
    }
    #${MODAL_ID} .mfp-plan-billing {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 0 22px 18px;
    }
    #${MODAL_ID} .mfp-plan-billing-option {
      position: relative;
      min-width: 0;
      padding: 14px 13px 13px;
      border: 1px solid rgba(255, 219, 104, .16);
      border-radius: 16px;
      color: #e4d8bd;
      background: rgba(255, 248, 226, .045);
      text-align: left;
      cursor: pointer;
      transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
    }
    #${MODAL_ID} .mfp-plan-billing-option:hover,
    #${MODAL_ID} .mfp-plan-billing-option:focus-visible {
      border-color: rgba(255, 217, 90, .48);
      background: rgba(255, 217, 90, .08);
      outline: none;
    }
    #${MODAL_ID} .mfp-plan-billing-option.is-selected {
      border-color: #ffd95a;
      color: #fff8e5;
      background: linear-gradient(145deg, rgba(255, 217, 90, .17), rgba(255, 191, 31, .07));
      box-shadow: 0 10px 28px rgba(190, 128, 0, .16), 0 0 0 1px rgba(255, 217, 90, .08) inset;
    }
    #${MODAL_ID} .mfp-plan-billing-name {
      display: block;
      margin-bottom: 7px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    #${MODAL_ID} .mfp-plan-billing-price {
      display: flex;
      align-items: baseline;
      gap: 4px;
      color: #fffaf0;
    }
    #${MODAL_ID} .mfp-plan-billing-price strong {
      font-size: 25px;
      line-height: 1;
    }
    #${MODAL_ID} .mfp-plan-billing-price span,
    #${MODAL_ID} .mfp-plan-billing-detail {
      color: #bcae91;
      font-size: 11px;
    }
    #${MODAL_ID} .mfp-plan-billing-detail {
      display: block;
      margin-top: 6px;
    }
    #${MODAL_ID} .mfp-plan-billing-save {
      position: absolute;
      top: -8px;
      right: 9px;
      padding: 3px 7px;
      border-radius: 999px;
      color: #4a3100;
      background: #ffd95a;
      box-shadow: 0 5px 12px rgba(183, 122, 0, .22);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    #${MODAL_ID} .mfp-plan-current {
      margin: 0 22px 18px;
      padding: 15px 16px;
      border: 1px solid rgba(255, 219, 104, .18);
      border-radius: 18px;
      color: #d4c8af;
      background: rgba(255, 217, 90, .07);
      font-size: 12.5px;
      line-height: 1.55;
    }
    #${MODAL_ID} .mfp-plan-current strong {
      display: block;
      margin-bottom: 4px;
      color: #fffaf0;
      font-size: 14px;
    }
    #${MODAL_ID} .mfp-plan-actions {
      position: sticky;
      bottom: 0;
      padding: 15px 22px 22px;
      background: linear-gradient(180deg, rgba(23,20,14,0), #17140e 28%);
    }
    #${MODAL_ID} .mfp-plan-cta {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 14px;
      color: #3f2b00;
      background: linear-gradient(100deg, #ffe77f 0%, #ffd95a 48%, #f4b91f 100%);
      box-shadow: 0 13px 30px rgba(199, 137, 8, .28);
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: filter .16s ease, transform .16s ease, box-shadow .16s ease;
    }
    #${MODAL_ID} .mfp-plan-cta:hover,
    #${MODAL_ID} .mfp-plan-cta:focus-visible {
      filter: brightness(1.04);
      transform: translateY(-1px);
      box-shadow: 0 16px 34px rgba(199, 137, 8, .34);
      outline: none;
    }
    #${MODAL_ID} .mfp-plan-cta:disabled {
      cursor: wait;
      filter: saturate(.55);
      opacity: .72;
      transform: none;
    }
    #${MODAL_ID} .mfp-plan-note {
      min-height: 16px;
      margin: 8px 4px 0;
      color: #b8aa8e;
      text-align: center;
      font-size: 11.5px;
    }
  `;
  document.head.appendChild(style);
}

export function closePlanModal(): void {
  document.getElementById(MODAL_ID)?.remove();
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

export function openPlanModal(options: { plan: AppPlan; context: PlanModalContext }): void {
  injectPlanModalStyles();
  closePlanModal();

  const copy =
    options.plan === 'pro'
      ? {
          title: 'Your myFeedPilot Pro plan',
          description: 'Review your plan here, then open secure billing management when needed.',
        }
      : getContextCopy(options.context);
  let selectedBillingInterval: ProBillingInterval = 'annual';
  const getUpgradeLabel = (): string =>
    selectedBillingInterval === 'annual' ? 'Upgrade to Pro — $156/year' : 'Upgrade to Pro — $19/month';
  const billingSelector =
    options.plan === 'free'
      ? `
      <div class="mfp-plan-billing" role="group" aria-label="Choose billing period">
        <button class="mfp-plan-billing-option" type="button" data-billing-interval="monthly" aria-pressed="false">
          <span class="mfp-plan-billing-name">Monthly</span>
          <span class="mfp-plan-billing-price"><strong>$19</strong><span>/ month</span></span>
          <span class="mfp-plan-billing-detail">Billed monthly</span>
        </button>
        <button class="mfp-plan-billing-option is-selected" type="button" data-billing-interval="annual" aria-pressed="true">
          <span class="mfp-plan-billing-save">Save 32%</span>
          <span class="mfp-plan-billing-name">Annual</span>
          <span class="mfp-plan-billing-price"><strong>$13</strong><span>/ month</span></span>
          <span class="mfp-plan-billing-detail">$156 billed yearly</span>
        </button>
      </div>
    `
      : '';
  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.innerHTML = `
    <section class="mfp-plan-modal" role="dialog" aria-modal="true" aria-labelledby="mfp-plan-title">
      <button class="mfp-plan-close" type="button" aria-label="Close">×</button>
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
        <button class="mfp-plan-cta" type="button">${options.plan === 'pro' ? 'Manage billing' : getUpgradeLabel()}</button>
        <div class="mfp-plan-note" aria-live="polite"></div>
      </div>
    </section>
  `;

  const close = (): void => closePlanModal();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  overlay.querySelector('.mfp-plan-close')?.addEventListener('click', close);
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
      if (cta) cta.textContent = getUpgradeLabel();
    });
  });
  cta?.addEventListener('click', () => {
    const note = overlay.querySelector<HTMLElement>('.mfp-plan-note');
    if (!cta || cta.disabled) return;
    const originalLabel = cta.textContent || '';
    cta.disabled = true;
    cta.textContent = options.plan === 'pro' ? 'Opening billing…' : 'Opening secure checkout…';

    void (options.plan === 'pro' ? openCustomerPortal() : openCheckout(selectedBillingInterval))
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

  document.body.appendChild(overlay);
  if (options.plan === 'pro') void hydrateSubscriptionSummary(overlay);
  overlay.querySelector<HTMLElement>('.mfp-plan-close')?.focus();
}
