import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAN_REFRESH_REQUESTED_EVENT } from '../../subscription/plan-refresh';
import { createGuestClaimVerificationController } from '../controllers/guest-claim-verification-controller';

function createController(sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const renderSidebar = vi.fn();
  const showToast = vi.fn();
  return {
    controller: createGuestClaimVerificationController({ sendMsg, renderSidebar, showToast }),
    renderSidebar,
    showToast,
  };
}

describe('guest claim email verification controller', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a failed initial delivery only when a pending guest claim exists', () => {
    const { controller } = createController(vi.fn());

    controller.setInitialEmailDeliveryResult(false);
    expect(controller.getState().required).toBe(false);

    controller.setRequired(true);
    expect(controller.getState()).toMatchObject({
      required: true,
      feedback: "We couldn't send the verification email. Please try again.",
      feedbackTone: 'error',
    });
  });

  it('resends once and keeps the button on cooldown for one minute', async () => {
    vi.useFakeTimers();
    const sendMsg = vi.fn().mockResolvedValue({ success: true, alreadyVerified: false });
    const { controller, renderSidebar } = createController(sendMsg);
    controller.setRequired(true);

    await controller.resendEmail();

    expect(sendMsg).toHaveBeenCalledWith({ type: 'FEEDS_RESEND_EMAIL_VERIFICATION' });
    expect(controller.getState()).toMatchObject({
      resendOnCooldown: true,
      feedback: 'Verification email sent. Check your inbox and spam folder.',
      feedbackTone: 'success',
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.getState().resendOnCooldown).toBe(false);
    expect(renderSidebar).toHaveBeenCalled();
  });

  it('keeps the notice visible until Firebase reports a verified email', async () => {
    const sendMsg = vi.fn().mockResolvedValue({
      success: true,
      verified: false,
      verificationRequired: true,
    });
    const { controller } = createController(sendMsg);
    controller.setRequired(true);

    await controller.checkVerification();

    expect(controller.getState()).toMatchObject({
      required: true,
      action: 'idle',
      feedback: 'Email is not verified yet. Open the link in your email, then try again.',
    });
  });

  it('hides the notice and requests an authoritative plan refresh after the claim succeeds', async () => {
    const sendMsg = vi.fn().mockResolvedValue({
      success: true,
      verified: true,
      verificationRequired: false,
      claimedCount: 1,
    });
    const planRefreshListener = vi.fn();
    document.addEventListener(PLAN_REFRESH_REQUESTED_EVENT, planRefreshListener);
    const { controller, showToast } = createController(sendMsg);
    controller.setRequired(true);

    await controller.checkVerification();

    expect(controller.getState().required).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Email verified. Activating Pro…', 'success');
    expect(planRefreshListener).toHaveBeenCalledOnce();
    document.removeEventListener(PLAN_REFRESH_REQUESTED_EVENT, planRefreshListener);
  });
});
