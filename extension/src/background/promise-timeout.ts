export class PromiseTimeoutError extends Error {
  constructor(
    readonly label: string,
    readonly timeoutMs: number
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'PromiseTimeoutError';
  }
}

/**
 * Bounds Chrome API calls that do not accept an AbortSignal, such as
 * scripting.executeScript. The injected request should still use its own
 * AbortController so the page-side work is cancelled as well.
 */
export async function withPromiseTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new PromiseTimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
