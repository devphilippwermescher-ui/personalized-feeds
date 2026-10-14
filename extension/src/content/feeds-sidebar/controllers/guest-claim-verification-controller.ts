import { requestPlanRefresh } from '../../subscription/plan-refresh';
import type { GuestClaimVerificationViewState } from '../types';

const RESEND_COOLDOWN_MS = 60_000;

interface GuestClaimVerificationControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  renderSidebar: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

function createInitialState(): GuestClaimVerificationViewState {
  return {
    required: false,
    action: 'idle',
    feedback: '',
    feedbackTone: 'neutral',
    resendOnCooldown: false,
  };
}

export function createGuestClaimVerificationController(deps: GuestClaimVerificationControllerDeps): {
  getState: () => GuestClaimVerificationViewState;
  setRequired: (required: boolean) => void;
  setInitialEmailDeliveryResult: (sent: boolean | null) => void;
  resendEmail: () => Promise<void>;
  checkVerification: () => Promise<void>;
  reset: () => void;
} {
  let state = createInitialState();
  let initialEmailDeliveryResult: boolean | null = null;
  let resendCooldownTimer: ReturnType<typeof setTimeout> | null = null;

  const render = (): void => deps.renderSidebar();
  const clearCooldown = (): void => {
    if (resendCooldownTimer) clearTimeout(resendCooldownTimer);
    resendCooldownTimer = null;
  };
  const reset = (): void => {
    clearCooldown();
    initialEmailDeliveryResult = null;
    state = createInitialState();
  };

  const setRequired = (required: boolean): void => {
    if (!required) {
      reset();
      return;
    }
    if (state.required) return;
    state = {
      ...createInitialState(),
      required: true,
      feedback:
        initialEmailDeliveryResult === true
          ? 'Verification email sent. Check your inbox and spam folder.'
          : initialEmailDeliveryResult === false
            ? "We couldn't send the verification email. Please try again."
            : '',
      feedbackTone: initialEmailDeliveryResult === false ? 'error' : 'neutral',
    };
  };

  const setInitialEmailDeliveryResult = (sent: boolean | null): void => {
    initialEmailDeliveryResult = sent;
    if (!state.required || sent === null) return;
    state = {
      ...state,
      feedback: sent
        ? 'Verification email sent. Check your inbox and spam folder.'
        : "We couldn't send the verification email. Please try again.",
      feedbackTone: sent ? 'neutral' : 'error',
    };
  };

  const checkVerification = async (): Promise<void> => {
    if (!state.required || state.action !== 'idle') return;
    state = { ...state, action: 'checking', feedback: '', feedbackTone: 'neutral' };
    render();
    try {
      const response = await deps.sendMsg({ type: 'FEEDS_CHECK_EMAIL_VERIFICATION' });
      if (response?.success !== true) {
        throw new Error((response?.error as string) || 'Email verification could not be checked.');
      }
      if (response.verified !== true) {
        state = {
          ...state,
          action: 'idle',
          feedback: 'Email is not verified yet. Open the link in your email, then try again.',
          feedbackTone: 'neutral',
        };
        return;
      }

      const verificationRequired = response.verificationRequired === true;
      state = {
        ...createInitialState(),
        required: verificationRequired,
        feedback: verificationRequired ? 'Email is verified, but the subscription could not be linked yet.' : '',
        feedbackTone: verificationRequired ? 'error' : 'neutral',
      };
      if (!verificationRequired) {
        deps.showToast('Email verified. Activating Pro…', 'success');
        requestPlanRefresh();
      }
    } catch (error) {
      state = {
        ...state,
        action: 'idle',
        feedback: error instanceof Error ? error.message : 'Email verification could not be checked.',
        feedbackTone: 'error',
      };
    } finally {
      render();
    }
  };

  const resendEmail = async (): Promise<void> => {
    if (!state.required || state.action !== 'idle' || state.resendOnCooldown) return;
    state = { ...state, action: 'sending', feedback: '', feedbackTone: 'neutral' };
    render();
    try {
      const response = await deps.sendMsg({ type: 'FEEDS_RESEND_EMAIL_VERIFICATION' });
      if (response?.success !== true) {
        throw new Error((response?.error as string) || 'Verification email could not be sent.');
      }
      if (response.alreadyVerified === true) {
        state = { ...state, action: 'idle' };
        await checkVerification();
        return;
      }
      state = {
        ...state,
        action: 'idle',
        feedback: 'Verification email sent. Check your inbox and spam folder.',
        feedbackTone: 'success',
        resendOnCooldown: true,
      };
      clearCooldown();
      resendCooldownTimer = setTimeout(() => {
        state = { ...state, resendOnCooldown: false };
        resendCooldownTimer = null;
        render();
      }, RESEND_COOLDOWN_MS);
    } catch (error) {
      state = {
        ...state,
        action: 'idle',
        feedback: error instanceof Error ? error.message : 'Verification email could not be sent.',
        feedbackTone: 'error',
      };
    } finally {
      render();
    }
  };

  return {
    getState: () => ({ ...state }),
    setRequired,
    setInitialEmailDeliveryResult,
    resendEmail,
    checkVerification,
    reset,
  };
}
