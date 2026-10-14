import { afterEach, describe, expect, it } from 'vitest';
import { renderSidebarAuthForm } from '../components/AuthForm/AuthForm';
import {
  captureAuthFormStates,
  createEmptyAuthFormStates,
  restoreAuthFormState,
} from '../logic/auth-form-state';

describe('sidebar authentication form state', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('preserves sign-up values, consent, focus, and caret across a rerender', () => {
    document.body.innerHTML = renderSidebarAuthForm('sign-up');
    const firstName = document.querySelector<HTMLInputElement>('[name="firstName"]')!;
    const email = document.querySelector<HTMLInputElement>('[name="email"]')!;
    const password = document.querySelector<HTMLInputElement>('[name="password"]')!;
    const confirmPassword = document.querySelector<HTMLInputElement>('[name="confirmPassword"]')!;
    const consent = document.querySelector<HTMLInputElement>('[name="acceptedPersonalData"]')!;

    firstName.value = 'Ada';
    email.value = 'ada@example.com';
    password.value = 'secret-password';
    confirmPassword.value = 'secret-password';
    consent.checked = true;
    firstName.focus();
    firstName.setSelectionRange(2, 2);

    const states = captureAuthFormStates(document.body, createEmptyAuthFormStates());
    document.body.innerHTML = renderSidebarAuthForm('sign-up', 'Network error. Please try again.');
    restoreAuthFormState(document.body, 'sign-up', states['sign-up']);

    expect(document.querySelector<HTMLInputElement>('[name="firstName"]')?.value).toBe('Ada');
    expect(document.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe('ada@example.com');
    expect(document.querySelector<HTMLInputElement>('[name="password"]')?.value).toBe('secret-password');
    expect(document.querySelector<HTMLInputElement>('[name="confirmPassword"]')?.value).toBe('secret-password');
    expect(document.querySelector<HTMLInputElement>('[name="acceptedPersonalData"]')?.checked).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[name="firstName"]'));
    expect(document.querySelector<HTMLInputElement>('[name="firstName"]')?.selectionStart).toBe(2);
  });

  it('keeps independent drafts when switching between sign-in and sign-up', () => {
    document.body.innerHTML = renderSidebarAuthForm('sign-in');
    document.querySelector<HTMLInputElement>('[name="email"]')!.value = 'signin@example.com';
    let states = captureAuthFormStates(document.body, createEmptyAuthFormStates());

    document.body.innerHTML = renderSidebarAuthForm('sign-up');
    document.querySelector<HTMLInputElement>('[name="email"]')!.value = 'signup@example.com';
    states = captureAuthFormStates(document.body, states);

    document.body.innerHTML = renderSidebarAuthForm('sign-in');
    restoreAuthFormState(document.body, 'sign-in', states['sign-in']);
    expect(document.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe('signin@example.com');

    document.body.innerHTML = renderSidebarAuthForm('sign-up');
    restoreAuthFormState(document.body, 'sign-up', states['sign-up']);
    expect(document.querySelector<HTMLInputElement>('[name="email"]')?.value).toBe('signup@example.com');
  });
});
