import type { SidebarAuthMode } from '../../types';
import { CONTENT_COPY } from '../../../shared/copy';
import { escapeHtml } from '../../../shared/escape-html';

function renderAuthError(message: string): string {
  return message
    ? `<p class="lfa-auth-error" role="alert" aria-live="polite">${escapeHtml(message)}</p>`
    : '';
}

function renderPasswordVisibilityIcons(): string {
  return `
    <svg class="lfa-auth-password-icon" data-password-icon="hidden" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M3 3l18 18"></path>
      <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a19.6 19.6 0 0 1-3 3.9"></path>
      <path d="M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4.1-.9"></path>
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
    </svg>
    <svg class="lfa-auth-password-icon lfa-auth-password-icon--inactive" data-password-icon="visible" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}

function renderPasswordField(params: {
  id: string;
  name: string;
  label: string;
  autocomplete: string;
  visibilityTargets?: string[];
}): string {
  const hasVisibilityToggle = Boolean(params.visibilityTargets?.length);
  const visibilityLabel = (params.visibilityTargets?.length || 0) > 1 ? 'passwords' : 'password';
  return `
    <label class="lfa-auth-field" for="${params.id}">
      <span>${params.label}</span>
      <span class="lfa-auth-password-wrap">
        <input
          class="lfa-auth-input${hasVisibilityToggle ? ' lfa-auth-password-input' : ''}"
          id="${params.id}"
          name="${params.name}"
          type="password"
          autocomplete="${params.autocomplete}"
          minlength="6"
          required
        />
        ${
          hasVisibilityToggle
            ? `<button
                class="lfa-auth-password-toggle"
                type="button"
                data-password-toggle="${params.visibilityTargets?.join(' ')}"
                aria-label="Show ${visibilityLabel}"
                title="Show ${visibilityLabel}"
              >
                ${renderPasswordVisibilityIcons()}
              </button>`
            : ''
        }
      </span>
    </label>
  `;
}

function renderGoogleSignIn(): string {
  return `
    <div class="lfa-auth-divider"><span>or</span></div>
    <button class="lfa-signin-btn" id="lfa-signin-btn" type="button">${CONTENT_COPY.sidebar.signInButton}</button>
    <p class="lfa-unauth-hint">${CONTENT_COPY.sidebar.signInHint}</p>
  `;
}

function renderSignInForm(authErrorMessage: string): string {
  return `
    <form class="lfa-auth-form" id="lfa-email-signin-form">
      <label class="lfa-auth-field" for="lfa-signin-email">
        <span>Email</span>
        <input class="lfa-auth-input" id="lfa-signin-email" name="email" type="email" autocomplete="email" required />
      </label>
      ${renderPasswordField({
        id: 'lfa-signin-password',
        name: 'password',
        label: 'Password',
        autocomplete: 'current-password',
        visibilityTargets: ['lfa-signin-password'],
      })}
      ${renderAuthError(authErrorMessage)}
      <button class="lfa-email-auth-submit" type="submit">Sign in</button>
    </form>
    ${renderGoogleSignIn()}
    <p class="lfa-auth-switch">Don't have an account? <button id="lfa-show-signup" type="button">Sign up</button></p>
  `;
}

function renderSignUpForm(authErrorMessage: string): string {
  return `
    <form class="lfa-auth-form" id="lfa-email-signup-form">
      <div class="lfa-auth-name-row">
        <label class="lfa-auth-field" for="lfa-signup-first-name">
          <span>First name</span>
          <input class="lfa-auth-input" id="lfa-signup-first-name" name="firstName" type="text" autocomplete="given-name" maxlength="60" required />
        </label>
        <label class="lfa-auth-field" for="lfa-signup-last-name">
          <span>Last name <small>(optional)</small></span>
          <input class="lfa-auth-input" id="lfa-signup-last-name" name="lastName" type="text" autocomplete="family-name" maxlength="60" />
        </label>
      </div>
      <label class="lfa-auth-field" for="lfa-signup-email">
        <span>Email</span>
        <input class="lfa-auth-input" id="lfa-signup-email" name="email" type="email" autocomplete="email" required />
      </label>
      ${renderPasswordField({
        id: 'lfa-signup-password',
        name: 'password',
        label: 'Password',
        autocomplete: 'new-password',
        visibilityTargets: ['lfa-signup-password', 'lfa-signup-confirm-password'],
      })}
      ${renderPasswordField({
        id: 'lfa-signup-confirm-password',
        name: 'confirmPassword',
        label: 'Confirm password',
        autocomplete: 'new-password',
      })}
      ${renderAuthError(authErrorMessage)}
      <label class="lfa-auth-consent">
        <input id="lfa-signup-personal-data" name="acceptedPersonalData" type="checkbox" required />
        <span>I agree to the processing of my personal data.</span>
      </label>
      <button class="lfa-email-auth-submit" type="submit">Create account</button>
    </form>
    ${renderGoogleSignIn()}
    <p class="lfa-auth-switch">Already have an account? <button id="lfa-show-signin" type="button">Sign in</button></p>
  `;
}

export function renderSidebarAuthForm(mode: SidebarAuthMode, authErrorMessage = ''): string {
  return mode === 'sign-up' ? renderSignUpForm(authErrorMessage) : renderSignInForm(authErrorMessage);
}
