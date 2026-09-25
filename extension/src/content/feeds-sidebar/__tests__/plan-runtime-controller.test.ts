import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPlanRefresh } from '../../subscription/plan-refresh';
import { registerPlanRuntimeController } from '../controllers/plan-runtime-controller';

describe('sidebar plan runtime controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the authoritative plan, rerenders the badge, and starts Pro features', async () => {
    const setPlan = vi.fn();
    const renderSidebar = vi.fn();
    const activateProFeatures = vi.fn().mockResolvedValue(undefined);
    let currentPlan: 'free' | 'pro' = 'free';
    const unregister = registerPlanRuntimeController({
      getPlan: () => currentPlan,
      refreshPlan: vi.fn().mockResolvedValue('pro'),
      setPlan: (plan) => {
        currentPlan = plan;
        setPlan(plan);
      },
      renderSidebar,
      activateProFeatures,
    });

    requestPlanRefresh();

    await vi.waitFor(() => {
      expect(setPlan).toHaveBeenCalledWith('pro');
      expect(renderSidebar).toHaveBeenCalledOnce();
      expect(activateProFeatures).toHaveBeenCalledOnce();
    });

    unregister();
  });

  it('does not start Pro collection when the authoritative refresh still returns Free', async () => {
    const setPlan = vi.fn();
    const renderSidebar = vi.fn();
    const activateProFeatures = vi.fn().mockResolvedValue(undefined);
    let currentPlan: 'free' | 'pro' = 'free';
    const unregister = registerPlanRuntimeController({
      getPlan: () => currentPlan,
      refreshPlan: vi.fn().mockResolvedValue('free'),
      setPlan: (plan) => {
        currentPlan = plan;
        setPlan(plan);
      },
      renderSidebar,
      activateProFeatures,
    });

    requestPlanRefresh();

    await vi.waitFor(() => {
      expect(setPlan).toHaveBeenCalledWith('free');
      expect(renderSidebar).toHaveBeenCalledOnce();
    });
    expect(activateProFeatures).not.toHaveBeenCalled();

    unregister();
  });

  it('retries after returning to LinkedIn until the checkout webhook activates Pro', async () => {
    vi.useFakeTimers();
    let currentPlan: 'free' | 'pro' = 'free';
    const refreshPlan = vi.fn().mockResolvedValueOnce('free').mockResolvedValue('pro');
    const activateProFeatures = vi.fn().mockResolvedValue(undefined);
    const unregister = registerPlanRuntimeController({
      getPlan: () => currentPlan,
      refreshPlan,
      setPlan: (plan) => {
        currentPlan = plan;
      },
      renderSidebar: vi.fn(),
      activateProFeatures,
    });

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1_500);

    expect(currentPlan).toBe('pro');
    expect(refreshPlan).toHaveBeenCalledTimes(2);
    expect(activateProFeatures).toHaveBeenCalledOnce();

    unregister();
  });
});
