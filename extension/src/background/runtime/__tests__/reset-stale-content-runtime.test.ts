import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetStaleContentRuntimeRegistration } from '../reset-stale-content-runtime';

const MARKER = '__testContentRuntimeRegistration__';

describe('stale content runtime reset', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[MARKER];
  });

  it('disposes and removes a stale same-build registration', () => {
    const dispose = vi.fn();
    (window as unknown as Record<string, unknown>)[MARKER] = { dispose };

    resetStaleContentRuntimeRegistration(MARKER);

    expect(dispose).toHaveBeenCalledOnce();
    expect((window as unknown as Record<string, unknown>)[MARKER]).toBeUndefined();
  });

  it('still removes the marker when stale cleanup throws', () => {
    (window as unknown as Record<string, unknown>)[MARKER] = {
      dispose: () => {
        throw new Error('Extension context invalidated');
      },
    };

    expect(() => resetStaleContentRuntimeRegistration(MARKER)).not.toThrow();
    expect((window as unknown as Record<string, unknown>)[MARKER]).toBeUndefined();
  });
});
