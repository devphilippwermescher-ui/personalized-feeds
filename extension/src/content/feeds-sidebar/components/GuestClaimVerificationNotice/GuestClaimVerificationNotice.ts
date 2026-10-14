import { escapeHtml } from '../../../shared/escape-html';
import type { GuestClaimVerificationViewState } from '../../types';

export function renderGuestClaimVerificationNotice(
  state: GuestClaimVerificationViewState | undefined,
  email: string
): string {
  if (!state?.required) return '';

  const resendDisabled = state.action !== 'idle' || state.resendOnCooldown;
  const checkDisabled = state.action !== 'idle';
  const resendLabel = state.action === 'sending' ? 'Sending…' : state.resendOnCooldown ? 'Email sent' : 'Resend email';
  const checkLabel = state.action === 'checking' ? 'Checking…' : "I've verified";

  return `
    <section class="lfa-guest-claim-verification" aria-labelledby="lfa-guest-claim-verification-title">
      <div class="lfa-guest-claim-verification-heading">
        <span class="lfa-guest-claim-verification-icon" aria-hidden="true">!</span>
        <span id="lfa-guest-claim-verification-title">Verification required</span>
      </div>
      <p class="lfa-guest-claim-verification-copy">
        Verify <strong>${escapeHtml(email)}</strong> to activate your existing Pro subscription.
      </p>
      ${
        state.feedback
          ? `<p class="lfa-guest-claim-verification-feedback lfa-guest-claim-verification-feedback--${state.feedbackTone}" role="status">${escapeHtml(state.feedback)}</p>`
          : ''
      }
      <div class="lfa-guest-claim-verification-actions">
        <button
          id="lfa-resend-verification-email-btn"
          class="lfa-guest-claim-verification-btn lfa-guest-claim-verification-btn--secondary"
          type="button"
          ${resendDisabled ? 'disabled' : ''}
        >${resendLabel}</button>
        <button
          id="lfa-check-email-verification-btn"
          class="lfa-guest-claim-verification-btn lfa-guest-claim-verification-btn--primary"
          type="button"
          ${checkDisabled ? 'disabled' : ''}
        >${checkLabel}</button>
      </div>
    </section>
  `;
}
