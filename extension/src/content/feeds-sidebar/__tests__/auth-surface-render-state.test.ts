import { afterEach, describe, expect, it } from 'vitest';
import { canReuseAuthSurface, getAuthSurfaceRenderKey } from '../logic/auth-surface-render-state';

describe('authentication surface render state', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reuses the existing form when only unrelated sidebar state updates', () => {
    document.body.innerHTML = '<div class="lfa-unauth"><input name="email" /></div>';
    const renderKey = getAuthSurfaceRenderKey({
      mode: 'sign-in',
      errorMessage: '',
      isLoading: false,
      isInitializing: false,
    });

    expect(canReuseAuthSurface(document.body, renderKey, renderKey)).toBe(true);
  });

  it('requires a rerender when visible authentication state changes', () => {
    document.body.innerHTML = '<div class="lfa-unauth"></div>';
    const previousRenderKey = getAuthSurfaceRenderKey({
      mode: 'sign-in',
      errorMessage: '',
      isLoading: false,
      isInitializing: false,
    });
    const nextRenderKey = getAuthSurfaceRenderKey({
      mode: 'sign-in',
      errorMessage: 'Incorrect email or password.',
      isLoading: false,
      isInitializing: false,
    });

    expect(canReuseAuthSurface(document.body, previousRenderKey, nextRenderKey)).toBe(false);
  });

  it('rerenders if the expected authentication DOM is missing', () => {
    const renderKey = getAuthSurfaceRenderKey({
      mode: 'sign-up',
      errorMessage: '',
      isLoading: false,
      isInitializing: false,
    });

    expect(canReuseAuthSurface(document.body, renderKey, renderKey)).toBe(false);
  });
});
