import type { SidebarAuthMode } from '../types';

interface AuthSurfaceRenderState {
  mode: SidebarAuthMode;
  errorMessage: string;
  isLoading: boolean;
  isInitializing: boolean;
}

export function getAuthSurfaceRenderKey(state: AuthSurfaceRenderState): string {
  return JSON.stringify(state);
}

export function canReuseAuthSurface(
  container: HTMLElement,
  previousRenderKey: string | null,
  nextRenderKey: string
): boolean {
  if (previousRenderKey !== nextRenderKey) return false;
  return Boolean(container.querySelector('.lfa-unauth, .lfa-loading'));
}
