import type { BillingNotice } from 'shared/billing-notices';

interface BillingNoticeContent {
  title: string;
  message: string;
  actionLabel: string;
}

function formatEndDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function getBillingNoticeContent(notice: BillingNotice): BillingNoticeContent {
  if (notice.kind === 'ending_soon') {
    return {
      title: 'Your Pro plan ends soon',
      message: `Your Pro access ends on ${formatEndDate(notice.endsAt!)}. Renew now to keep all feeds and profiles unlocked.`,
      actionLabel: 'Keep Pro',
    };
  }
  if (notice.kind === 'payment_failed') {
    return {
      title: 'Payment needs attention',
      message: 'We couldn’t renew your subscription. Update your payment method to keep your Pro access.',
      actionLabel: 'Update payment',
    };
  }
  return {
    title: 'Your Pro plan has ended',
    message: 'Your account is now on Free. Your data is safe, but Free limits now apply.',
    actionLabel: 'View plans',
  };
}

export function createBillingNoticeElement(
  notice: BillingNotice,
  onClose: () => void,
  onAction: () => void
): HTMLElement {
  const content = getBillingNoticeContent(notice);
  const element = document.createElement('aside');
  element.className = `lfa-billing-notice lfa-billing-notice--${notice.kind}`;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');

  const closeButton = document.createElement('button');
  closeButton.className = 'lfa-billing-notice-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Dismiss billing notification');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', onClose);

  const icon = document.createElement('span');
  icon.className = 'lfa-billing-notice-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = notice.kind === 'expired' ? 'i' : '!';

  const body = document.createElement('div');
  body.className = 'lfa-billing-notice-body';

  const title = document.createElement('strong');
  title.className = 'lfa-billing-notice-title';
  title.textContent = content.title;

  const message = document.createElement('p');
  message.className = 'lfa-billing-notice-message';
  message.textContent = content.message;

  const actionButton = document.createElement('button');
  actionButton.className = 'lfa-billing-notice-action';
  actionButton.type = 'button';
  actionButton.textContent = content.actionLabel;
  actionButton.addEventListener('click', onAction);

  body.append(title, message, actionButton);
  element.append(closeButton, icon, body);
  return element;
}
