import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshContentRuntimeRegistration } from '../refresh-content-runtime-registration';

const MARKER = '__testContentRuntimeRegistration__';

describe('content runtime direct refresh', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[MARKER];
  });

  it('calls the active registration directly', () => {
    const refresh = vi.fn();
    (window as unknown as Record<string, unknown>)[MARKER] = { refresh };

    expect(refreshContentRuntimeRegistration(MARKER)).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('rejects a missing or stale registration', () => {
    expect(refreshContentRuntimeRegistration(MARKER)).toBe(false);
    (window as unknown as Record<string, unknown>)[MARKER] = {
      refresh: () => {
        throw new Error('Extension context invalidated');
      },
    };
    expect(refreshContentRuntimeRegistration(MARKER)).toBe(false);
  });
});
