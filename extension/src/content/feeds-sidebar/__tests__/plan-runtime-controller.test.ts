import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPlanRefresh } from '../../subscription/plan-refresh';
import { registerPlanRuntimeController } from '../controllers/plan-runtime-controller';

describe('sidebar plan runtime controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('refreshes the authoritative plan, rerenders the badge, and starts Pro features', async () => {
    const setPlan = vi.fn();
    const renderSidebar = vi.fn();
    const activateProFeatures = vi.fn().mockResolvedValue(undefined);
    const unregister = registerPlanRuntimeController({
      refreshPlan: vi.fn().mockResolvedValue('pro'),
      setPlan,
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
    const unregister = registerPlanRuntimeController({
      refreshPlan: vi.fn().mockResolvedValue('free'),
      setPlan,
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
});
