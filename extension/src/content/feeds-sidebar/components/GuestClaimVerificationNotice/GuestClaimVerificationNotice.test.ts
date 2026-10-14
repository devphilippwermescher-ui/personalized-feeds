import { describe, expect, it } from 'vitest';
import { renderGuestClaimVerificationNotice } from './GuestClaimVerificationNotice';

describe('guest claim verification notice', () => {
  it('stays hidden when no guest subscription needs verification', () => {
    expect(
      renderGuestClaimVerificationNotice(
        {
          required: false,
          action: 'idle',
          feedback: '',
          feedbackTone: 'neutral',
          resendOnCooldown: false,
        },
        'user@example.com'
      )
    ).toBe('');
  });

  it('renders safe email verification actions without exposing billing controls', () => {
    const html = renderGuestClaimVerificationNotice(
      {
        required: true,
        action: 'idle',
        feedback: 'Verification email sent.',
        feedbackTone: 'success',
        resendOnCooldown: false,
      },
      'user+<unsafe>@example.com'
    );

    expect(html).toContain('Verification required');
    expect(html).toContain('user+&lt;unsafe&gt;@example.com');
    expect(html).toContain('lfa-resend-verification-email-btn');
    expect(html).toContain('lfa-check-email-verification-btn');
    expect(html).not.toContain('checkout');
    expect(html).not.toContain('Continue');
  });
});
