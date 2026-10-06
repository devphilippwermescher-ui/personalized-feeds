import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedActions } from '../logic/feed-actions';
import type { ProfileData } from '../types';

describe('profile feed card refresh', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not resolve relationship status when the profile card is opened again', async () => {
    const currentProfile: ProfileData = {
      linkedinUrl: 'https://www.linkedin.com/in/yuliia-biliavtseva/',
      linkedinUsername: 'yuliia-biliavtseva',
      displayName: 'Yuliia Biliavtseva',
    };
    const sendMessageToBackground = vi.fn().mockResolvedValue({ memberships: [] });
    const actions = createFeedActions({
      getCurrentProfileData: () => currentProfile,
      sendMessageToBackground,
      showToast: vi.fn(),
      emitFeedMemberAdded: vi.fn(),
    });

    await actions.refreshCardState();
    await actions.refreshCardState();

    expect(sendMessageToBackground).toHaveBeenCalledTimes(2);
    expect(sendMessageToBackground.mock.calls.map(([message]) => message.type)).toEqual([
      'FEEDS_GET_PROFILE_MEMBERSHIPS',
      'FEEDS_GET_PROFILE_MEMBERSHIPS',
    ]);
  });
});
