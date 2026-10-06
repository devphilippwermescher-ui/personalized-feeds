import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseProfileViewersCollectionProgress,
  registerProfileViewersRuntimeController,
} from '../controllers/profile-viewers-runtime-controller';

describe('Profile Visitors collection progress', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('expires legacy progress that has no explicit lease', () => {
    expect(
      parseProfileViewersCollectionProgress(
        {
          phase: 'visible',
          startedAt: 1_000,
        },
        5 * 60 * 1000 + 1_001
      )
    ).toBeUndefined();
  });

  it('clears progress locally when a completion event is missed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    let listener: ((message: Record<string, unknown>) => void) | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn((registeredListener) => {
            listener = registeredListener;
          }),
        },
      },
    });
    const setCollectionProgress = vi.fn();
    const refreshAfterSync = vi.fn().mockResolvedValue(undefined);

    registerProfileViewersRuntimeController({ setCollectionProgress, refreshAfterSync });
    listener?.({
      type: 'PROFILE_VIEWERS_SYNC_STARTED',
      syncProgress: {
        phase: 'visible',
        startedAt: 1_000,
        expiresAt: 2_000,
      },
    });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(setCollectionProgress).toHaveBeenLastCalledWith(undefined);
    expect(refreshAfterSync).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
