import { isPassiveAnalyticsUrl, parsePassiveAnalyticsResponse } from './linkedin-analytics-passive-parser';

const MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE';
const PING_MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE_PING';
const recentCaptures = new Map<string, ReturnType<typeof parsePassiveAnalyticsResponse>>();

function inspectResponse(url: string, payload: string): void {
  const capture = parsePassiveAnalyticsResponse(url, payload);
  if (!capture) return;
  const key = typeof capture.connectionsCount === 'number' ? 'connections' : 'followers';
  recentCaptures.set(key, capture);
  window.postMessage({ type: MESSAGE_TYPE, ...capture }, window.location.origin);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== PING_MESSAGE_TYPE) {
    return;
  }
  recentCaptures.forEach((capture) => {
    if (capture) window.postMessage({ type: MESSAGE_TYPE, ...capture }, window.location.origin);
  });
});

function normalizeRequestUrl(value: string): string {
  try {
    return new URL(value, window.location.href).href;
  } catch {
    return value;
  }
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof window.fetch>): Promise<Response> => {
  const response = await originalFetch(...args);
  const request = args[0];
  const url = normalizeRequestUrl(
    typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
  );
  if (isPassiveAnalyticsUrl(url)) {
    void response
      .clone()
      .text()
      .then((payload) => inspectResponse(url, payload))
      .catch(() => {
        /* Passive capture must never affect LinkedIn's own request. */
      });
  }
  return response;
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL, ...rest: unknown[]): void {
  (this as XMLHttpRequest & { __mfpAnalyticsUrl?: string }).__mfpAnalyticsUrl = normalizeRequestUrl(String(url || ''));
  Reflect.apply(originalOpen, this, [method, url, ...rest]);
};

XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null): void {
  const request = this as XMLHttpRequest & { __mfpAnalyticsUrl?: string };
  const url = request.__mfpAnalyticsUrl || '';
  if (isPassiveAnalyticsUrl(url)) {
    request.addEventListener('load', () => {
      try {
        const payload =
          typeof request.responseText === 'string'
            ? request.responseText
            : request.response
              ? JSON.stringify(request.response)
              : '';
        inspectResponse(url, payload);
      } catch {
        /* Some XHR response types intentionally reject responseText access. */
      }
    });
  }
  originalSend.call(this, body);
};
