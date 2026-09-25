import type { AppPlan } from 'shared/plans';
import { onPlanRefreshRequested } from '../../subscription/plan-refresh';

interface PlanRuntimeControllerOptions {
  getPlan: () => AppPlan;
  refreshPlan: () => Promise<AppPlan>;
  setPlan: (plan: AppPlan) => void;
  renderSidebar: () => void;
  activateProFeatures: () => Promise<void>;
}

export function registerPlanRuntimeController(options: PlanRuntimeControllerOptions): () => void {
  let refreshPromise: Promise<void> | null = null;
  let refreshQueued = false;
  let retryTimeoutIds: number[] = [];

  const clearRetryTimeouts = (): void => {
    retryTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    retryTimeoutIds = [];
  };

  const refresh = (): void => {
    if (refreshPromise) {
      refreshQueued = true;
      return;
    }

    const previousPlan = options.getPlan();
    refreshPromise = options
      .refreshPlan()
      .then(async (plan) => {
        options.setPlan(plan);
        options.renderSidebar();

        if (previousPlan !== 'pro' && plan === 'pro') {
          clearRetryTimeouts();
          await options.activateProFeatures();
        }
      })
      .catch((error) => {
        console.warn('[plan] Failed to apply the refreshed subscription state', error);
      })
      .finally(() => {
        refreshPromise = null;
        if (refreshQueued) {
          refreshQueued = false;
          refresh();
        }
      });
  };

  const scheduleRefreshBurst = (): void => {
    if (options.getPlan() === 'pro') return;
    clearRetryTimeouts();
    refresh();
    retryTimeoutIds = [1_500, 4_000, 8_000].map((delay) =>
      window.setTimeout(() => {
        if (options.getPlan() === 'free') refresh();
      }, delay)
    );
  };

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') scheduleRefreshBurst();
  };
  const unregisterRequestListener = onPlanRefreshRequested(scheduleRefreshBurst);
  window.addEventListener('focus', scheduleRefreshBurst);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    unregisterRequestListener();
    window.removeEventListener('focus', scheduleRefreshBurst);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearRetryTimeouts();
  };
}
