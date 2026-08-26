import { isPassiveAnalyticsUrl, parsePassiveAnalyticsResponse } from './linkedin-analytics-passive-parser';
import { getLinkedInProfileMetadataMutation } from './linkedin-profile-metadata-change-detector';
import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';

const MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE';
const PING_MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE_PING';
const SSI_REQUEST_MESSAGE_TYPE = 'MFP_LINKEDIN_SSI_REQUEST';
const SSI_RESPONSE_MESSAGE_TYPE = 'MFP_LINKEDIN_SSI_RESPONSE';
const SSI_URL = 'https://www.linkedin.com/sales-api/salesApiSsi';
const PROFILE_METADATA_CHANGED_MESSAGE_TYPE = 'MFP_LINKEDIN_PROFILE_METADATA_CHANGED';
const recentCaptures = new Map<string, ReturnType<typeof parsePassiveAnalyticsResponse>>();

function inspectResponse(url: string, payload: string): void {
  const capture = parsePassiveAnalyticsResponse(url, payload);
  if (!capture) return;
  const key =
    typeof capture.connectionsCount === 'number'
      ? 'connections'
      : typeof capture.socialSellingIndexScore === 'number'
        ? 'social-selling-index'
        : 'followers';
  recentCaptures.set(key, capture);
  window.postMessage({ type: MESSAGE_TYPE, ...capture }, window.location.origin);
}

function inspectProfileMetadataMutation(url: string, status: number): void {
  const mutation = getLinkedInProfileMetadataMutation(url, status);
  if (!mutation) return;
  window.postMessage(
    {
      type: PROFILE_METADATA_CHANGED_MESSAGE_TYPE,
      mutation,
      sourceUrl: url,
      capturedAt: Date.now(),
    },
    window.location.origin
  );
}

function installLinkedInAnalyticsNetworkHook(): void {
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

  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      event.data?.type !== SSI_REQUEST_MESSAGE_TYPE ||
      typeof event.data?.requestId !== 'string'
    ) {
      return;
    }

    const requestId = event.data.requestId;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    const csrfToken = document.cookie.match(/(?:^|;\s*)JSESSIONID="?([^";]+)"?/)?.[1] || '';
    void originalFetch(SSI_URL, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: '*/*',
        ...(csrfToken
          ? {
              'csrf-token': csrfToken,
              'x-restli-protocol-version': '2.0.0',
            }
          : {}),
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = response.ok ? await response.json() : undefined;
        window.postMessage(
          {
            type: SSI_RESPONSE_MESSAGE_TYPE,
            requestId,
            response: { ok: response.ok, status: response.status, payload },
          },
          window.location.origin
        );
      })
      .catch((error) => {
        window.postMessage(
          {
            type: SSI_RESPONSE_MESSAGE_TYPE,
            requestId,
            response: { ok: false, error: error instanceof Error ? error.message : String(error) },
          },
          window.location.origin
        );
      })
      .finally(() => window.clearTimeout(timeoutId));
  });

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
    inspectProfileMetadataMutation(url, response.status);
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL, ...rest: unknown[]): void {
    (this as XMLHttpRequest & { __mfpAnalyticsUrl?: string }).__mfpAnalyticsUrl = normalizeRequestUrl(
      String(url || '')
    );
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
    request.addEventListener('load', () => inspectProfileMetadataMutation(url, request.status));
    originalSend.call(this, body);
  };
}

if (DASHBOARD_ANALYTICS_SYNC_ENABLED) {
  installLinkedInAnalyticsNetworkHook();
}
