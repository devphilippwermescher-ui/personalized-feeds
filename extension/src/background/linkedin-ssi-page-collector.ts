export interface LinkedInSsiPageResponse {
  ok: boolean;
  status?: number;
  payload?: unknown;
  error?: string;
}

/**
 * Runs in LinkedIn's MAIN world through chrome.scripting.executeScript.
 * Keep this function self-contained: imported runtime values are unavailable
 * after Chrome serializes it for page execution.
 */
export async function collectSocialSellingIndexInLinkedInPage(url: string): Promise<LinkedInSsiPageResponse> {
  function collectVisibleMemberScore(): number | undefined {
    const text = (document.body?.innerText || document.body?.textContent || '').replace(/\s+/g, ' ').trim();
    const value =
      text.match(
        /current\s+social\s+selling\s+index[\s\S]{0,500}?(\d{1,3})(?:\s+out\s+of\s+100|\s*\/\s*100)/i
      )?.[1] || text.match(/\b(\d{1,3})(?:\s+out\s+of\s+100|\s*\/\s*100)\b/i)?.[1];
    if (!value) return undefined;
    const score = Number(value);
    return Number.isInteger(score) && score >= 0 && score <= 100 ? score : undefined;
  }

  function visibleScoreResponse(status?: number): LinkedInSsiPageResponse | null {
    const score = collectVisibleMemberScore();
    return typeof score === 'number'
      ? { ok: true, status, payload: { memberScore: { overall: score } } }
      : null;
  }

  async function waitForVisibleScore(status?: number): Promise<LinkedInSsiPageResponse | null> {
    const immediate = visibleScoreResponse(status);
    if (immediate || !/^\/sales\/ssi\/?$/i.test(window.location.pathname)) return immediate;

    const startedAt = Date.now();
    while (Date.now() - startedAt < 10_000) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const response = visibleScoreResponse(status);
      if (response) return response;
    }
    return null;
  }

  const controller = new AbortController();
  const requestTimeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      referrer: 'https://www.linkedin.com/sales/ssi',
      headers: { accept: '*/*' },
      signal: controller.signal,
    });
    if (!response.ok) return (await waitForVisibleScore(response.status)) || { ok: false, status: response.status };

    const payload = await response.json();
    const memberScore =
      payload && typeof payload === 'object' ? (payload as { memberScore?: unknown }).memberScore : undefined;
    const overall =
      memberScore && typeof memberScore === 'object'
        ? (memberScore as { overall?: unknown }).overall
        : undefined;
    if (typeof overall === 'number' && Number.isFinite(overall) && overall >= 0 && overall <= 100) {
      return { ok: true, status: response.status, payload };
    }
    return (await waitForVisibleScore(response.status)) || { ok: true, status: response.status, payload };
  } catch (error) {
    return (
      (await waitForVisibleScore()) || { ok: false, error: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    clearTimeout(requestTimeoutId);
  }
}
