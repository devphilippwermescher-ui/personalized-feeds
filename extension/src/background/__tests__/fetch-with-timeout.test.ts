import { describe, expect, it, vi } from 'vitest';
import { FetchTimeoutError, fetchWithTimeout } from '../fetch-with-timeout';

describe('fetchWithTimeout', () => {
  it('returns a response when the request finishes before the timeout', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchImplementation = vi.fn().mockResolvedValue(response);

    await expect(fetchWithTimeout('https://www.linkedin.com/test', {}, 100, fetchImplementation)).resolves.toBe(
      response
    );
  });

  it('rejects with FetchTimeoutError when the request does not finish', async () => {
    const fetchImplementation = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );

    await expect(fetchWithTimeout('https://www.linkedin.com/test', {}, 5, fetchImplementation)).rejects.toBeInstanceOf(
      FetchTimeoutError
    );
  });
});
