import { describe, expect, it, vi } from 'vitest';
import { registerContentRuntime } from '../content-runtime-registration';
import { CONTENT_RUNTIME_REPLACEMENT_MARKER } from '../../../shared/content-runtime';

describe('content runtime registration', () => {
  it('refreshes a healthy same-build runtime without destroying its observers', () => {
    const host = {} as Window;
    const initialize = vi.fn();
    const dispose = vi.fn();
    const refresh = vi.fn();

    expect(registerContentRuntime(host, 'build-1', initialize, dispose, refresh)).toBe(true);
    expect(registerContentRuntime(host, 'build-1', initialize, vi.fn())).toBe(false);
    expect(refresh).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledOnce();
  });

  it('replaces a same-build runtime only after background recovery requested it', () => {
    const host = {} as Window;
    const runtimeHost = host as unknown as Record<string, unknown>;
    const initialize = vi.fn();
    const dispose = vi.fn();

    registerContentRuntime(host, 'build-1', initialize, dispose);
    runtimeHost[CONTENT_RUNTIME_REPLACEMENT_MARKER] = true;

    expect(registerContentRuntime(host, 'build-1', initialize, vi.fn())).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(runtimeHost[CONTENT_RUNTIME_REPLACEMENT_MARKER]).toBeUndefined();
  });

  it('disposes the stale runtime and initializes a newly built bundle', () => {
    const host = {} as Window;
    const disposeOldRuntime = vi.fn();
    const initializeNewRuntime = vi.fn();

    registerContentRuntime(host, 'build-1', vi.fn(), disposeOldRuntime);
    expect(registerContentRuntime(host, 'build-2', initializeNewRuntime, vi.fn())).toBe(true);

    expect(disposeOldRuntime).toHaveBeenCalledOnce();
    expect(initializeNewRuntime).toHaveBeenCalledOnce();
  });

  it('still starts the new runtime when stale cleanup uses an invalid Chrome context', () => {
    const host = {} as Window;
    const initializeNewRuntime = vi.fn();

    registerContentRuntime(host, 'build-1', vi.fn(), () => {
      throw new Error('Extension context invalidated');
    });

    expect(registerContentRuntime(host, 'build-2', initializeNewRuntime, vi.fn())).toBe(true);
    expect(initializeNewRuntime).toHaveBeenCalledOnce();
  });
});
