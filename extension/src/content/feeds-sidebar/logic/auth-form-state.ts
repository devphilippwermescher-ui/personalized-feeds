import type { SidebarAuthMode } from '../types';

const AUTH_FORM_FIELDS = ['firstName', 'lastName', 'email', 'password', 'confirmPassword'] as const;

type AuthFormField = (typeof AUTH_FORM_FIELDS)[number];

export interface AuthFormState {
  values: Record<AuthFormField, string>;
  acceptedPersonalData: boolean;
  focusedField: AuthFormField | null;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export type AuthFormStates = Record<SidebarAuthMode, AuthFormState>;

function createEmptyAuthFormState(): AuthFormState {
  return {
    values: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    acceptedPersonalData: false,
    focusedField: null,
    selectionStart: null,
    selectionEnd: null,
  };
}

export function createEmptyAuthFormStates(): AuthFormStates {
  return {
    'sign-in': createEmptyAuthFormState(),
    'sign-up': createEmptyAuthFormState(),
  };
}

function getForm(container: HTMLElement, mode: SidebarAuthMode): HTMLFormElement | null {
  const formId = mode === 'sign-up' ? '#lfa-email-signup-form' : '#lfa-email-signin-form';
  return container.querySelector<HTMLFormElement>(formId);
}

function getInput(form: HTMLFormElement, field: AuthFormField): HTMLInputElement | null {
  const input = form.elements.namedItem(field);
  return input instanceof HTMLInputElement ? input : null;
}

function captureForm(container: HTMLElement, mode: SidebarAuthMode, previous: AuthFormState): AuthFormState {
  const form = getForm(container, mode);
  if (!form) return previous;

  const activeElement = document.activeElement;
  const focusedInput = activeElement instanceof HTMLInputElement && form.contains(activeElement) ? activeElement : null;
  const focusedField = AUTH_FORM_FIELDS.find((field) => focusedInput?.name === field) || null;
  const acceptedPersonalData = form.elements.namedItem('acceptedPersonalData');

  return {
    values: {
      firstName: getInput(form, 'firstName')?.value || '',
      lastName: getInput(form, 'lastName')?.value || '',
      email: getInput(form, 'email')?.value || '',
      password: getInput(form, 'password')?.value || '',
      confirmPassword: getInput(form, 'confirmPassword')?.value || '',
    },
    acceptedPersonalData:
      acceptedPersonalData instanceof HTMLInputElement ? acceptedPersonalData.checked : previous.acceptedPersonalData,
    focusedField,
    selectionStart: focusedInput?.selectionStart ?? null,
    selectionEnd: focusedInput?.selectionEnd ?? null,
  };
}

export function captureAuthFormStates(container: HTMLElement, previous: AuthFormStates): AuthFormStates {
  return {
    'sign-in': captureForm(container, 'sign-in', previous['sign-in']),
    'sign-up': captureForm(container, 'sign-up', previous['sign-up']),
  };
}

export function restoreAuthFormState(container: HTMLElement, mode: SidebarAuthMode, state: AuthFormState): void {
  const form = getForm(container, mode);
  if (!form) return;

  AUTH_FORM_FIELDS.forEach((field) => {
    const input = getInput(form, field);
    if (input) input.value = state.values[field];
  });

  const acceptedPersonalData = form.elements.namedItem('acceptedPersonalData');
  if (acceptedPersonalData instanceof HTMLInputElement) {
    acceptedPersonalData.checked = state.acceptedPersonalData;
  }

  if (!state.focusedField) return;
  const focusedInput = getInput(form, state.focusedField);
  if (!focusedInput) return;

  focusedInput.focus({ preventScroll: true });
  if (state.selectionStart !== null && state.selectionEnd !== null) {
    focusedInput.setSelectionRange(state.selectionStart, state.selectionEnd);
  }
}
