import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendBillingMessage } from '../services/billing-message-client';

describe('billing background messaging', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries once when the background receiver is still starting', async () => {
    vi.useFakeTimers();
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({ success: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const responsePromise = sendBillingMessage({ type: 'BILLING_OPEN_PRICING' });
    await vi.advanceTimersByTimeAsync(150);

    await expect(responsePromise).resolves.toEqual({ success: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('retries once when no listener returned a response', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ success: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const responsePromise = sendBillingMessage({ type: 'BILLING_OPEN_PORTAL' });
    await vi.advanceTimersByTimeAsync(150);

    await expect(responsePromise).resolves.toEqual({ success: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a billing action after the background returned a failure', async () => {
    const response = { success: false, error: 'Billing is unavailable' };
    const sendMessage = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    await expect(sendBillingMessage({ type: 'BILLING_OPEN_PORTAL' })).resolves.toEqual(response);
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('reports an unavailable background after the single retry is exhausted', async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    const responsePromise = sendBillingMessage({ type: 'BILLING_OPEN_PRICING' });
    const rejection = expect(responsePromise).rejects.toThrow(
      'The extension background service is unavailable'
    );
    await vi.advanceTimersByTimeAsync(150);

    await rejection;
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not retry an invalidated extension context', async () => {
    const error = new Error('Extension context invalidated.');
    const sendMessage = vi.fn().mockRejectedValue(error);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    await expect(sendBillingMessage({ type: 'BILLING_OPEN_PRICING' })).rejects.toBe(error);
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
