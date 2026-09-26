import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBillingNoticeController } from '../controllers/billing-notice-controller';

describe('billing notice controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="lfa-sidebar" class="lfa-sidebar lfa-sidebar-open"></div>';
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: vi.fn(),
        },
      },
    });
  });

  it('loads the current notice, opens its billing action, and dismisses it', async () => {
    const sendMsg = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'BILLING_NOTICE_GET') {
        return {
          success: true,
          notice: { id: 'past-due', kind: 'payment_failed', action: 'portal' },
        };
      }
      return { success: true };
    });
    const controller = createBillingNoticeController({
      sendMsg,
      isSidebarOpen: () => true,
      showError: vi.fn(),
    });

    controller.start();

    await vi.waitFor(() => {
      expect(document.querySelector('.lfa-billing-notice')).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>('.lfa-billing-notice-action')?.click();

    await vi.waitFor(() => {
      expect(sendMsg).toHaveBeenCalledWith({ type: 'BILLING_OPEN_PORTAL' });
      expect(sendMsg).toHaveBeenCalledWith({ type: 'BILLING_NOTICE_DISMISS', noticeId: 'past-due' });
      expect(document.querySelector('.lfa-billing-notice')).toBeNull();
    });
  });
});
