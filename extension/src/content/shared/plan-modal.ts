import type { AppPlan } from 'shared/plans';
import { getLemonSqueezyCheckoutUrl } from 'shared/subscription-config';

export type PlanModalContext = 'manage' | 'feeds' | 'members';

const MODAL_ID = 'mfp-plan-modal-overlay';
const STYLE_ID = 'mfp-plan-modal-styles';

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
      background: rgba(15, 23, 42, 0.56);
      backdrop-filter: blur(5px);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #${MODAL_ID} .mfp-plan-modal {
      position: relative;
      width: min(430px, calc(100vw - 32px));
      max-height: min(720px, calc(100vh - 32px));
      overflow: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      color: #f8fafc;
      background:
        radial-gradient(circle at 50% -5%, rgba(139, 92, 246, 0.52), transparent 34%),
        linear-gradient(180deg, #15192b 0%, #10131f 100%);
      box-shadow: 0 32px 90px rgba(2, 6, 23, 0.48);
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
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 50%;
      color: #fff;
      background: rgba(15,23,42,.52);
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
    }
    #${MODAL_ID} .mfp-plan-hero {
      padding: 54px 28px 24px;
      text-align: center;
    }
    #${MODAL_ID} .mfp-plan-star {
      width: 92px;
      height: 92px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border-radius: 30px;
      color: white;
      background: linear-gradient(145deg, #54b9ff, #7c5cff 55%, #d868ef);
      box-shadow: 0 18px 45px rgba(124, 92, 255, .42);
      font-size: 54px;
      transform: rotate(-7deg);
    }
    #${MODAL_ID} h2 {
      margin: 0 0 10px;
      color: #fff;
      font-size: 25px;
      line-height: 1.2;
    }
    #${MODAL_ID} .mfp-plan-description {
      margin: 0;
      color: #bdc5d6;
      font-size: 14px;
      line-height: 1.5;
    }
    #${MODAL_ID} .mfp-plan-benefits {
      margin: 0 22px 18px;
      padding: 4px 16px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 18px;
      background: rgba(255,255,255,.055);
    }
    #${MODAL_ID} .mfp-plan-benefit {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 11px;
      padding: 14px 0;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }
    #${MODAL_ID} .mfp-plan-benefit:last-child { border-bottom: 0; }
    #${MODAL_ID} .mfp-plan-benefit-icon {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      color: #fff;
      background: linear-gradient(145deg, #695cf6, #a75fe8);
      font-size: 17px;
    }
    #${MODAL_ID} .mfp-plan-benefit strong {
      display: block;
      margin-bottom: 3px;
      color: #f8fafc;
      font-size: 14px;
    }
    #${MODAL_ID} .mfp-plan-benefit span {
      color: #aeb8cc;
      font-size: 12.5px;
      line-height: 1.4;
    }
    #${MODAL_ID} .mfp-plan-about-label {
      margin: 0 26px 8px;
      color: #8f99ad;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    #${MODAL_ID} .mfp-plan-about {
      margin: 0 22px 6px;
      padding: 16px;
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 18px;
      color: #bdc5d6;
      background: rgba(255,255,255,.055);
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
      color: #f8fafc;
    }
    #${MODAL_ID} .mfp-plan-actions {
      position: sticky;
      bottom: 0;
      padding: 15px 22px 22px;
      background: linear-gradient(180deg, rgba(16,19,31,0), #10131f 28%);
    }
    #${MODAL_ID} .mfp-plan-cta {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 14px;
      color: #fff;
      background: linear-gradient(100deg, #56a8ff 0%, #7462f4 52%, #d05eea 100%);
      box-shadow: 0 13px 30px rgba(116, 98, 244, .32);
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }
    #${MODAL_ID} .mfp-plan-note {
      min-height: 16px;
      margin: 8px 4px 0;
      color: #aeb8cc;
      text-align: center;
      font-size: 11.5px;
    }
  `;
  document.head.appendChild(style);
}

export function closePlanModal(): void {
  document.getElementById(MODAL_ID)?.remove();
}

export function openPlanModal(options: { plan: AppPlan; context: PlanModalContext }): void {
  injectPlanModalStyles();
  closePlanModal();

  const copy = getContextCopy(options.context);
  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.innerHTML = `
    <section class="mfp-plan-modal" role="dialog" aria-modal="true" aria-labelledby="mfp-plan-title">
      <button class="mfp-plan-close" type="button" aria-label="Close">×</button>
      <div class="mfp-plan-hero">
        <div class="mfp-plan-star" aria-hidden="true">★</div>
        <h2 id="mfp-plan-title">${copy.title}</h2>
        <p class="mfp-plan-description">${copy.description}</p>
      </div>
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
        <button class="mfp-plan-cta" type="button">${options.plan === 'pro' ? 'Manage Pro subscription' : 'Upgrade to Pro'}</button>
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
  overlay.querySelector('.mfp-plan-cta')?.addEventListener('click', () => {
    const checkoutUrl = options.plan === 'free' ? getLemonSqueezyCheckoutUrl() : null;
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const note = overlay.querySelector<HTMLElement>('.mfp-plan-note');
    if (note) {
      note.textContent =
        options.plan === 'pro'
          ? 'Subscription management will be connected with the Lemon Squeezy customer portal.'
          : 'Checkout is ready to be connected when the Lemon Squeezy URL is added.';
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector<HTMLElement>('.mfp-plan-close')?.focus();
}
