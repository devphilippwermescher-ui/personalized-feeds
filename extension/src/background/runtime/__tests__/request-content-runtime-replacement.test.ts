import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestContentRuntimeReplacement } from '../request-content-runtime-replacement';

const MARKER = '__testContentRuntimeReplacementRequested__';

describe('content runtime replacement request', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[MARKER];
  });

  it('marks recovery without disposing the current runtime', () => {
    const dispose = vi.fn();
    const runtimeHost = window as unknown as Record<string, unknown>;
    runtimeHost.__testContentRuntimeRegistration__ = { dispose };

    requestContentRuntimeReplacement(MARKER);

    expect(runtimeHost[MARKER]).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    delete runtimeHost.__testContentRuntimeRegistration__;
  });
});
