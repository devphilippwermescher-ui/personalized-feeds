import { describe, expect, it, vi } from 'vitest';
import { registerContentRuntime } from '../content-runtime-registration';

describe('content runtime registration', () => {
  it('replaces the same content build when Chrome invalidated its old context', () => {
    const host = {} as Window;
    const initialize = vi.fn();
    const dispose = vi.fn();

    expect(registerContentRuntime(host, 'build-1', initialize, dispose)).toBe(true);
    expect(registerContentRuntime(host, 'build-1', initialize, vi.fn())).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledTimes(2);
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
