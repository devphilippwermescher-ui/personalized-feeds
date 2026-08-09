import {
  isInviteCreationRequest,
  isPotentialInviteRequest,
  isSuccessfulInviteCreationResponse,
  parseNativeInviteNetworkResult,
} from './native-invite-network-parser';

(() => {
  const marker = '__mfpLinkedInInviteNetworkHookInstalled';
  const postMessageType = 'MFP_LINKEDIN_NATIVE_INVITE_SENT';
  const hookPingMessageType = 'MFP_LINKEDIN_INVITE_NETWORK_HOOK_PING';
  const hookReadyMessageType = 'MFP_LINKEDIN_INVITE_NETWORK_HOOK_READY';
  const windowWithMarker = window as typeof window & Record<string, boolean | undefined>;

  if (windowWithMarker[marker]) {
    return;
  }
  windowWithMarker[marker] = true;

  function postHookReady(): void {
    window.postMessage({ type: hookReadyMessageType }, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source === window && event.origin === window.location.origin && event.data?.type === hookPingMessageType) {
      postHookReady();
    }
  });

  function normalizeLinkedInUrl(rawUrl: string): string {
    try {
      return new URL(rawUrl, window.location.origin).href;
    } catch {
      return rawUrl;
    }
  }

  function postInvite(url: string, requestBody: string, responseText: string): void {
    const parsed = parseNativeInviteNetworkResult(requestBody, responseText);

    window.postMessage(
      {
        type: postMessageType,
        invite: {
          requestUrl: normalizeLinkedInUrl(url),
          ...parsed,
        },
      },
      window.location.origin
    );
  }

  function bodyToTextSync(body: unknown): string {
    if (!body) {
      return '';
    }

    if (typeof body === 'string') {
      return body;
    }

    if (body instanceof URLSearchParams) {
      return body.toString();
    }

    if (body instanceof FormData) {
      return Array.from(body.entries())
        .map(([key, value]) => `${key}=${typeof value === 'string' ? value : value.name}`)
        .join('&');
    }

    try {
      return JSON.stringify(body);
    } catch {
      return '';
    }
  }

  async function getFetchRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
    if (init?.body) {
      return bodyToTextSync(init.body);
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
      return input.clone().text().catch(() => '');
    }

    return '';
  }

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const shouldInspect = isPotentialInviteRequest(url);
    const requestBodyPromise = shouldInspect ? getFetchRequestBody(input, init) : Promise.resolve('');
    const response = await originalFetch.apply(this, [input, init]);

    if (shouldInspect && response.ok) {
      void Promise.all([
        requestBodyPromise,
        response.clone().text().catch(() => ''),
      ]).then(([requestBody, responseText]) => {
        if (isInviteCreationRequest(url, requestBody) && isSuccessfulInviteCreationResponse(url, responseText)) {
          postInvite(url, requestBody, responseText);
        }
      });
    }

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL, ...rest: unknown[]) {
    (this as XMLHttpRequest & { __mfpInviteRequestUrl?: string }).__mfpInviteRequestUrl = String(url || '');
    if (rest.length === 0) {
      return originalOpen.call(this, method, url, true);
    }

    return originalOpen.call(
      this,
      method,
      url,
      rest[0] !== false,
      typeof rest[1] === 'string' ? rest[1] : undefined,
      typeof rest[2] === 'string' ? rest[2] : undefined
    );
  };

  XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
    const requestUrl = (this as XMLHttpRequest & { __mfpInviteRequestUrl?: string }).__mfpInviteRequestUrl || '';
    const shouldInspect = isPotentialInviteRequest(requestUrl);
    const requestBody = shouldInspect ? bodyToTextSync(body) : '';

    if (shouldInspect) {
      this.addEventListener('load', function onLoad() {
        const responseText = typeof this.responseText === 'string' ? this.responseText : '';
        if (
          this.status < 200 ||
          this.status >= 300 ||
          !isInviteCreationRequest(requestUrl, requestBody) ||
          !isSuccessfulInviteCreationResponse(requestUrl, responseText)
        ) {
          return;
        }

        postInvite(requestUrl, requestBody, responseText);
      });
    }

    return originalSend.call(this, body);
  };
})();
