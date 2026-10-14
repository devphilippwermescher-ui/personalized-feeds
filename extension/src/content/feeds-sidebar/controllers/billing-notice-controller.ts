import type { BillingNotice } from 'shared/billing-notices';
import { createBillingNoticeElement } from '../components/BillingNotice/BillingNotice';

interface BillingNoticeControllerDeps {
  sendMsg: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
  isSidebarOpen: () => boolean;
  showError: (message: string) => void;
}

function isBillingNotice(value: unknown): value is BillingNotice {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BillingNotice>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.kind === 'ending_soon' || candidate.kind === 'payment_failed' || candidate.kind === 'expired') &&
    (candidate.action === 'portal' || candidate.action === 'pricing')
  );
}

export function createBillingNoticeController(deps: BillingNoticeControllerDeps): { start: () => void } {
  let notice: BillingNotice | null = null;
  let element: HTMLElement | null = null;
  let submitting = false;
  let started = false;
  let sidebarObserver: MutationObserver | null = null;

  const syncVisibility = (): void => {
    if (element) element.hidden = !deps.isSidebarOpen();
  };

  const removeElement = (): void => {
    element?.remove();
    element = null;
  };

  const dismiss = async (): Promise<void> => {
    if (!notice || submitting) return;
    submitting = true;
    const response = await deps.sendMsg({ type: 'BILLING_NOTICE_DISMISS', noticeId: notice.id });
    submitting = false;
    if (!response.success) {
      deps.showError((response.error as string) || 'Unable to dismiss this billing notification.');
      return;
    }
    notice = null;
    removeElement();
  };

  const openAction = async (): Promise<void> => {
    if (!notice || submitting) return;
    submitting = true;
    const activeNotice = notice;
    const response = await deps.sendMsg({
      type: activeNotice.action === 'portal' ? 'BILLING_OPEN_PORTAL' : 'BILLING_OPEN_PRICING',
    });
    submitting = false;
    if (!response.success) {
      deps.showError((response.error as string) || 'Unable to open billing right now.');
      return;
    }
    await dismiss();
  };

  const render = (): void => {
    removeElement();
    if (!notice) return;
    element = createBillingNoticeElement(
      notice,
      () => void dismiss(),
      () => void openAction()
    );
    document.body.appendChild(element);
    syncVisibility();
  };

  const applyNotice = (value: unknown): void => {
    const nextNotice = isBillingNotice(value) ? value : null;
    if (notice?.id === nextNotice?.id && element) {
      syncVisibility();
      return;
    }
    notice = nextNotice;
    render();
  };

  const refresh = (): void => {
    void deps
      .sendMsg({ type: 'BILLING_NOTICE_GET' })
      .then((response) => {
        if (response.success) applyNotice(response.notice);
      })
      .catch((error) => {
        console.warn('[billing-notice] Could not refresh notification', error);
      });
  };

  const runtimeListener = (message: Record<string, unknown>): void => {
    if (message.type !== 'BILLING_NOTICE_UPDATED') return;
    applyNotice(message.notice);
  };

  return {
    start: () => {
      if (started) return;
      started = true;
      chrome.runtime.onMessage.addListener(runtimeListener);
      window.addEventListener('focus', refresh);

      const sidebar = document.getElementById('lfa-sidebar');
      if (sidebar) {
        sidebarObserver = new MutationObserver(syncVisibility);
        sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      }
      refresh();
    },
  };
}
