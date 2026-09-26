import type { SidebarAuthMode } from '../../types';
import { CONTENT_COPY } from '../../../shared/copy';

function renderPasswordVisibilityIcon(): string {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}

function renderPasswordField(params: { id: string; name: string; label: string; autocomplete: string }): string {
  return `
    <label class="lfa-auth-field" for="${params.id}">
      <span>${params.label}</span>
      <span class="lfa-auth-password-wrap">
        <input
          class="lfa-auth-input lfa-auth-password-input"
          id="${params.id}"
          name="${params.name}"
          type="password"
          autocomplete="${params.autocomplete}"
          minlength="6"
          required
        />
        <button
          class="lfa-auth-password-toggle"
          type="button"
          data-password-toggle="${params.id}"
          aria-label="Show ${params.label.toLowerCase()}"
          title="Show ${params.label.toLowerCase()}"
        >
          ${renderPasswordVisibilityIcon()}
        </button>
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

function renderSignInForm(): string {
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
      })}
      <button class="lfa-email-auth-submit" type="submit">Sign in</button>
    </form>
    ${renderGoogleSignIn()}
    <p class="lfa-auth-switch">Don't have an account? <button id="lfa-show-signup" type="button">Sign up</button></p>
  `;
}

function renderSignUpForm(): string {
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
      })}
      ${renderPasswordField({
        id: 'lfa-signup-confirm-password',
        name: 'confirmPassword',
        label: 'Confirm password',
        autocomplete: 'new-password',
      })}
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

export function renderSidebarAuthForm(mode: SidebarAuthMode): string {
  return mode === 'sign-up' ? renderSignUpForm() : renderSignInForm();
}
