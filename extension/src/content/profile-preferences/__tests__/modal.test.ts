import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeProfilePreferencesModal, openProfilePreferencesModal } from '../public';

describe('Profile & billing modal', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    closeProfilePreferencesModal();
    document.body.innerHTML = '';
    sendMessage.mockReset();
    sendMessage.mockImplementation(async (message: { type?: string; preferences?: unknown }) => ({
      success: true,
      preferences:
        message.type === 'PROFILE_PREFERENCES_UPDATE'
          ? message.preferences
          : { displayName: '', avatarDataUrl: '', billingCurrency: 'EUR' },
      user: {
        userId: 'user-1',
        displayName: 'Google Name',
        authDisplayName: 'Google Name',
        email: 'user@example.com',
        photoURL: '',
        authPhotoURL: '',
        billingCurrency: 'EUR',
      },
    }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    closeProfilePreferencesModal();
    vi.unstubAllGlobals();
  });

  it('shows profile controls with the default billing currency', async () => {
    await openProfilePreferencesModal();

    await vi.waitFor(() => expect(document.body.textContent).toContain('Profile & billing'));
    expect(document.querySelector<HTMLInputElement>('.lfs-input')?.value).toBe('Google Name');
    expect(document.body.textContent).toContain('user@example.com');
    expect(document.body.textContent).toContain('Billing currency');
    expect(document.querySelector<HTMLButtonElement>('.mfp-profile-preferences-currency-option.is-selected')?.textContent).toContain(
      'EUR'
    );
    expect(document.body.textContent).toContain('Reset to Google profile');
  });

  it('saves profile and billing preferences', async () => {
    await openProfilePreferencesModal();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Profile & billing'));

    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Save changes'))
      ?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'PROFILE_PREFERENCES_UPDATE',
        preferences: {
          displayName: '',
          avatarDataUrl: '',
          billingCurrency: 'EUR',
        },
      });
    });
  });

  it('removes an uploaded avatar from the photo control and saves the Google fallback', async () => {
    sendMessage.mockImplementation(async (message: { type?: string; preferences?: unknown }) => ({
      success: true,
      preferences:
        message.type === 'PROFILE_PREFERENCES_UPDATE'
          ? message.preferences
          : { displayName: '', avatarDataUrl: 'data:image/webp;base64,custom-avatar', billingCurrency: 'EUR' },
      user: {
        userId: 'user-1',
        displayName: 'Google Name',
        authDisplayName: 'Google Name',
        email: 'user@example.com',
        photoURL: 'data:image/webp;base64,custom-avatar',
        authPhotoURL: 'https://example.com/google-avatar.jpg',
        billingCurrency: 'EUR',
      },
    }));

    await openProfilePreferencesModal();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Profile & billing'));

    document.querySelector<HTMLButtonElement>('[aria-label="Remove uploaded profile photo"]')?.click();

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLImageElement>('.mfp-profile-preferences-avatar')?.src).toBe(
        'https://example.com/google-avatar.jpg'
      );
    });

    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Save changes'))
      ?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'PROFILE_PREFERENCES_UPDATE',
        preferences: {
          displayName: '',
          avatarDataUrl: '',
          billingCurrency: 'EUR',
        },
      });
    });
  });
});
