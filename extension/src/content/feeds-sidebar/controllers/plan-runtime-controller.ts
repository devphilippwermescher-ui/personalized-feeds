import type { AppPlan } from 'shared/plans';
import { onPlanRefreshRequested } from '../../subscription/plan-refresh';

interface PlanRuntimeControllerOptions {
  refreshPlan: () => Promise<AppPlan>;
  setPlan: (plan: AppPlan) => void;
  renderSidebar: () => void;
  activateProFeatures: () => Promise<void>;
}

export function registerPlanRuntimeController(options: PlanRuntimeControllerOptions): () => void {
  let refreshPromise: Promise<void> | null = null;

  return onPlanRefreshRequested(() => {
    if (refreshPromise) return;

    refreshPromise = options
      .refreshPlan()
      .then(async (plan) => {
        options.setPlan(plan);
        options.renderSidebar();

        if (plan === 'pro') {
          await options.activateProFeatures();
        }
      })
      .catch((error) => {
        console.warn('[plan] Failed to apply the refreshed subscription state', error);
      })
      .finally(() => {
        refreshPromise = null;
      });
  });
}
