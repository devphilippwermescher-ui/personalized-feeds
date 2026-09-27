import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindSidebarAuthForm } from '../../logic/auth-form-bindings';
import { renderSidebarAuthForm } from './AuthForm';

function renderAndBind(mode: 'sign-in' | 'sign-up', authErrorMessage = '') {
  document.body.innerHTML = renderSidebarAuthForm(mode, authErrorMessage);
  const handlers = {
    handleGoogleSignIn: vi.fn(),
    handleEmailSignIn: vi.fn(),
    handleEmailSignUp: vi.fn(),
    showSignIn: vi.fn(),
    showSignUp: vi.fn(),
  };
  bindSidebarAuthForm(document.body, handlers);
  return handlers;
}

describe('sidebar authentication form', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('keeps Google sign-in and submits email/password credentials', () => {
    const handlers = renderAndBind('sign-in');
    const email = document.querySelector<HTMLInputElement>('#lfa-signin-email');
    const password = document.querySelector<HTMLInputElement>('#lfa-signin-password');
    const form = document.querySelector<HTMLFormElement>('#lfa-email-signin-form');

    expect(document.querySelector('#lfa-signin-btn')?.textContent).toContain('Sign in with Google');
    expect(document.body.textContent).toContain("Don't have an account? Sign up");

    email!.value = ' user@example.com ';
    password!.value = 'secret-password';
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(handlers.handleEmailSignIn).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret-password',
    });
  });

  it('renders the required registration fields and submits an accepted form', () => {
    const handlers = renderAndBind('sign-up');
    const firstName = document.querySelector<HTMLInputElement>('#lfa-signup-first-name');
    const lastName = document.querySelector<HTMLInputElement>('#lfa-signup-last-name');
    const email = document.querySelector<HTMLInputElement>('#lfa-signup-email');
    const password = document.querySelector<HTMLInputElement>('#lfa-signup-password');
    const confirmPassword = document.querySelector<HTMLInputElement>('#lfa-signup-confirm-password');
    const consent = document.querySelector<HTMLInputElement>('#lfa-signup-personal-data');
    const form = document.querySelector<HTMLFormElement>('#lfa-email-signup-form');

    expect(firstName?.required).toBe(true);
    expect(lastName?.required).toBe(false);
    expect(email?.required).toBe(true);
    expect(password?.required).toBe(true);
    expect(confirmPassword?.required).toBe(true);
    expect(consent?.required).toBe(true);

    firstName!.value = 'Ada';
    lastName!.value = 'Lovelace';
    email!.value = 'ada@example.com';
    password!.value = 'analytical-engine';
    confirmPassword!.value = 'analytical-engine';
    consent!.checked = true;
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(handlers.handleEmailSignUp).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'analytical-engine',
      acceptedPersonalData: true,
    });
  });

  it('reveals and hides passwords without submitting the form', () => {
    renderAndBind('sign-in');
    const password = document.querySelector<HTMLInputElement>('#lfa-signin-password');
    const toggle = document.querySelector<HTMLButtonElement>('[data-password-toggle="lfa-signin-password"]');

    expect(
      toggle?.querySelector('[data-password-icon="hidden"]')?.classList.contains('lfa-auth-password-icon--inactive')
    ).toBe(false);
    expect(
      toggle?.querySelector('[data-password-icon="visible"]')?.classList.contains('lfa-auth-password-icon--inactive')
    ).toBe(true);

    toggle!.click();
    expect(password?.type).toBe('text');
    expect(toggle?.getAttribute('aria-label')).toBe('Hide password');
    expect(
      toggle?.querySelector('[data-password-icon="hidden"]')?.classList.contains('lfa-auth-password-icon--inactive')
    ).toBe(true);
    expect(
      toggle?.querySelector('[data-password-icon="visible"]')?.classList.contains('lfa-auth-password-icon--inactive')
    ).toBe(false);

    toggle!.click();
    expect(password?.type).toBe('password');
    expect(toggle?.getAttribute('aria-label')).toBe('Show password');
  });

  it('uses one visibility control for both registration password fields', () => {
    renderAndBind('sign-up');
    const password = document.querySelector<HTMLInputElement>('#lfa-signup-password');
    const confirmation = document.querySelector<HTMLInputElement>('#lfa-signup-confirm-password');
    const toggles = document.querySelectorAll<HTMLButtonElement>('[data-password-toggle]');

    expect(toggles).toHaveLength(1);
    expect(confirmation?.parentElement?.querySelector('[data-password-toggle]')).toBeNull();

    toggles[0].click();
    expect(password?.type).toBe('text');
    expect(confirmation?.type).toBe('text');
    expect(toggles[0].getAttribute('aria-label')).toBe('Hide passwords');

    toggles[0].click();
    expect(password?.type).toBe('password');
    expect(confirmation?.type).toBe('password');
    expect(toggles[0].getAttribute('aria-label')).toBe('Show passwords');
  });

  it('blocks registration when password confirmation does not match', () => {
    const handlers = renderAndBind('sign-up');
    document.querySelector<HTMLInputElement>('#lfa-signup-first-name')!.value = 'Ada';
    document.querySelector<HTMLInputElement>('#lfa-signup-email')!.value = 'ada@example.com';
    document.querySelector<HTMLInputElement>('#lfa-signup-password')!.value = 'password-one';
    document.querySelector<HTMLInputElement>('#lfa-signup-confirm-password')!.value = 'password-two';
    document.querySelector<HTMLInputElement>('#lfa-signup-personal-data')!.checked = true;

    document
      .querySelector<HTMLFormElement>('#lfa-email-signup-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(handlers.handleEmailSignUp).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('#lfa-signup-confirm-password')?.validationMessage).toBe(
      'Passwords do not match.'
    );
  });

  it('shows a registration error immediately before the personal-data consent', () => {
    renderAndBind('sign-up', 'An account with this email already exists.');

    const formChildren = [...document.querySelectorAll('#lfa-email-signup-form > *')];
    const errorIndex = formChildren.findIndex((element) => element.classList.contains('lfa-auth-error'));
    const consentIndex = formChildren.findIndex((element) => element.classList.contains('lfa-auth-consent'));

    expect(errorIndex).toBeGreaterThan(-1);
    expect(consentIndex).toBe(errorIndex + 1);
    expect(document.querySelector('.lfa-auth-error')?.textContent).toBe('An account with this email already exists.');
  });

  it('escapes authentication errors rendered inside the form', () => {
    renderAndBind('sign-in', '<img src=x onerror=alert(1)>');

    expect(document.querySelector('.lfa-auth-error')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.lfa-auth-error img')).toBeNull();
  });
});
