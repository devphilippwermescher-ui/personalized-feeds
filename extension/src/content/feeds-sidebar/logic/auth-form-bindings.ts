import type { EmailPasswordSignInInput, EmailPasswordSignUpInput } from '../types';

interface SidebarAuthFormBindingsDeps {
  handleGoogleSignIn: () => void;
  handleEmailSignIn: (input: EmailPasswordSignInInput) => void;
  handleEmailSignUp: (input: EmailPasswordSignUpInput) => void;
  showSignIn: () => void;
  showSignUp: () => void;
}

function getRequiredInput(form: HTMLFormElement, name: string): HTMLInputElement | null {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement ? input : null;
}

function bindPasswordVisibilityToggles(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-password-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetIds = button.dataset.passwordToggle?.split(/\s+/).filter(Boolean) || [];
      const inputs = targetIds
        .map((targetId) => container.querySelector<HTMLInputElement>(`#${targetId}`))
        .filter((input): input is HTMLInputElement => Boolean(input));
      if (inputs.length === 0) return;

      const nextVisible = inputs.some((input) => input.type === 'password');
      inputs.forEach((input) => {
        input.type = nextVisible ? 'text' : 'password';
      });
      const label = `${nextVisible ? 'Hide' : 'Show'} ${inputs.length > 1 ? 'passwords' : 'password'}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      const hiddenIcon = button.querySelector<SVGElement>('[data-password-icon="hidden"]');
      const visibleIcon = button.querySelector<SVGElement>('[data-password-icon="visible"]');
      hiddenIcon?.classList.toggle('lfa-auth-password-icon--inactive', nextVisible);
      visibleIcon?.classList.toggle('lfa-auth-password-icon--inactive', !nextVisible);
    });
  });
}

function bindEmailSignInForm(container: HTMLElement, deps: SidebarAuthFormBindingsDeps): void {
  const form = container.querySelector<HTMLFormElement>('#lfa-email-signin-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const email = getRequiredInput(form, 'email');
    const password = getRequiredInput(form, 'password');
    if (!email || !password) return;

    deps.handleEmailSignIn({
      email: email.value.trim(),
      password: password.value,
    });
  });
}

function bindEmailSignUpForm(container: HTMLElement, deps: SidebarAuthFormBindingsDeps): void {
  const form = container.querySelector<HTMLFormElement>('#lfa-email-signup-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();

    const password = getRequiredInput(form, 'password');
    const confirmPassword = getRequiredInput(form, 'confirmPassword');
    if (!password || !confirmPassword) return;

    confirmPassword.setCustomValidity(password.value === confirmPassword.value ? '' : 'Passwords do not match.');
    if (!form.reportValidity()) return;

    const firstName = getRequiredInput(form, 'firstName');
    const lastName = getRequiredInput(form, 'lastName');
    const email = getRequiredInput(form, 'email');
    const acceptedPersonalData = getRequiredInput(form, 'acceptedPersonalData');
    if (!firstName || !lastName || !email || !acceptedPersonalData) return;

    deps.handleEmailSignUp({
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      email: email.value.trim(),
      password: password.value,
      acceptedPersonalData: acceptedPersonalData.checked,
    });
  });

  const password = form ? getRequiredInput(form, 'password') : null;
  const confirmPassword = form ? getRequiredInput(form, 'confirmPassword') : null;
  [password, confirmPassword].forEach((input) => {
    input?.addEventListener('input', () => confirmPassword?.setCustomValidity(''));
  });
}

export function bindSidebarAuthForm(container: HTMLElement, deps: SidebarAuthFormBindingsDeps): void {
  container.querySelector('#lfa-signin-btn')?.addEventListener('click', deps.handleGoogleSignIn);
  container.querySelector('#lfa-show-signup')?.addEventListener('click', deps.showSignUp);
  container.querySelector('#lfa-show-signin')?.addEventListener('click', deps.showSignIn);
  bindPasswordVisibilityToggles(container);
  bindEmailSignInForm(container, deps);
  bindEmailSignUpForm(container, deps);
}
