import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeProfilePreferencesModal, openProfilePreferencesModal } from '../public';

describe('Profile modal', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    closeProfilePreferencesModal();
    document.body.innerHTML = '';
    sendMessage.mockReset();
    sendMessage.mockImplementation(async (message: { type?: string; preferences?: unknown }) => ({
      success: true,
      preferences:
        message.type === 'PROFILE_PREFERENCES_UPDATE' ? message.preferences : { displayName: '', avatarDataUrl: '' },
      user: {
        userId: 'user-1',
        displayName: 'Google Name',
        authDisplayName: 'Google Name',
        email: 'user@example.com',
        photoURL: '',
        authPhotoURL: '',
      },
    }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
  });

  afterEach(() => {
    closeProfilePreferencesModal();
    vi.unstubAllGlobals();
  });

  it('shows profile controls without billing preferences', async () => {
    await openProfilePreferencesModal();

    await vi.waitFor(() => expect(document.body.textContent).toContain('Profile'));
    expect(document.querySelector<HTMLInputElement>('.lfs-input')?.value).toBe('Google Name');
    expect(document.body.textContent).toContain('user@example.com');
    expect(document.body.textContent).not.toContain('Billing currency');
    expect(document.body.textContent).toContain('Reset to Google profile');
  });

  it('saves profile-only changes', async () => {
    await openProfilePreferencesModal();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Profile'));

    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Save changes'))
      ?.click();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'PROFILE_PREFERENCES_UPDATE',
        preferences: {
          displayName: '',
          avatarDataUrl: '',
        },
      });
    });
  });
});
