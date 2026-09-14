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
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage,
      },
    });
  });

  afterEach(() => {
    closeProfilePreferencesModal();
    vi.unstubAllGlobals();
  });

  it('shows profile controls and selects EUR for a new user', async () => {
    await openProfilePreferencesModal();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Profile & billing');
    });
    expect(document.querySelector<HTMLInputElement>('.lfs-input')?.value).toBe('Google Name');
    expect(document.body.textContent).toContain('user@example.com');
    expect(
      document.querySelector<HTMLButtonElement>('.mfp-profile-preferences-currency-option.is-selected')?.textContent
    ).toContain('EUR');
    expect(document.body.textContent).toContain('Reset to Google profile');
  });

  it('saves a manually selected USD preference', async () => {
    await openProfilePreferencesModal();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Profile & billing'));

    const usd = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.mfp-profile-preferences-currency-option')
    ).find((button) => button.textContent?.includes('USD'));
    usd?.click();
    await vi.waitFor(() => expect(usd?.classList.contains('is-selected')).toBe(true));
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Save changes'))
      ?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'PROFILE_PREFERENCES_UPDATE',
        preferences: {
          displayName: '',
          avatarDataUrl: '',
          billingCurrency: 'USD',
        },
      });
    });
  });
});
