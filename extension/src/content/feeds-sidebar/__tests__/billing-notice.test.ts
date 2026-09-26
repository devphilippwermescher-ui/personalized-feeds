import { describe, expect, it, vi } from 'vitest';
import { createBillingNoticeElement, getBillingNoticeContent } from '../components/BillingNotice/BillingNotice';

describe('billing notice card', () => {
  it('shows the exact cancellation date and Keep Pro action', () => {
    const content = getBillingNoticeContent({
      id: 'ending',
      kind: 'ending_soon',
      action: 'portal',
      endsAt: Date.parse('2026-09-30T12:00:00.000Z'),
    });

    expect(content.title).toBe('Your Pro plan ends soon');
    expect(content.message).toContain('September 30, 2026');
    expect(content.actionLabel).toBe('Keep Pro');
  });

  it('renders a persistent actionable payment warning', () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    const element = createBillingNoticeElement(
      { id: 'past-due', kind: 'payment_failed', action: 'portal' },
      onClose,
      onAction
    );

    expect(element.textContent).toContain('Payment needs attention');
    expect(element.textContent).toContain('Update payment');
    element.querySelector<HTMLButtonElement>('.lfa-billing-notice-close')?.click();
    element.querySelector<HTMLButtonElement>('.lfa-billing-notice-action')?.click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('explains that expired Pro data remains safe', () => {
    const content = getBillingNoticeContent({ id: 'expired', kind: 'expired', action: 'pricing' });
    expect(content.title).toBe('Your Pro plan has ended');
    expect(content.message).toContain('Your data is safe');
    expect(content.actionLabel).toBe('View plans');
  });
});
