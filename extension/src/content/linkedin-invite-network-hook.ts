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

  function getLinkedInRequestUrl(rawUrl: string): URL | null {
    try {
      return new URL(rawUrl, window.location.origin);
    } catch {
      return null;
    }
  }

  function isPotentialInviteRequest(rawUrl: string): boolean {
    const url = getLinkedInRequestUrl(rawUrl);
    return Boolean(url && /\/voyager\/api\//i.test(url.pathname) && /(?:relationship|invitation|invite)/i.test(url.pathname));
  }

  function isInviteCreationUrl(rawUrl: string, requestBody = ''): boolean {
    const url = getLinkedInRequestUrl(rawUrl);
    if (!url) {
      return false;
    }

    const isKnownCreateEndpoint =
      /\/voyager\/api\/voyagerRelationshipsDashMemberRelationships$/i.test(url.pathname) &&
      url.searchParams.get('action') === 'verifyQuotaAndCreateV2';
    const hasInvitePayload = /(?:inviteeUnion|memberProfile|invitee)/i.test(requestBody);
    return isKnownCreateEndpoint || (isPotentialInviteRequest(rawUrl) && hasInvitePayload);
  }

  function normalizeLinkedInUrl(rawUrl: string): string {
    try {
      return new URL(rawUrl, window.location.origin).href;
    } catch {
      return rawUrl;
    }
  }

  function extractProfileUrn(text: string): string {
    return text.match(/urn:li:fsd_profile:[A-Za-z0-9_-]+/)?.[0] || '';
  }

  function extractMemberNumericId(text: string): string {
    return text.match(/urn:li:member:(\d+)/)?.[1] || '';
  }

  function extractLinkedInUsername(text: string): string {
    const publicIdentifierMatch = text.match(/"publicIdentifier"\s*:\s*"([^"]+)"/);
    if (publicIdentifierMatch?.[1]) {
      return publicIdentifierMatch[1];
    }

    const profileUrlMatch = text.match(/linkedin\.com\/in\/([^/?#"\\]+)/i) || text.match(/\/in\/([^/?#"\\]+)/i);
    return profileUrlMatch?.[1] || '';
  }

  function postInvite(url: string, requestBody: string, responseText: string): void {
    const profileUrn = extractProfileUrn(`${requestBody}\n${responseText}`);
    const memberNumericId = extractMemberNumericId(`${requestBody}\n${responseText}`);
    const linkedinUsername = extractLinkedInUsername(responseText);

    window.postMessage(
      {
        type: postMessageType,
        invite: {
          requestUrl: normalizeLinkedInUrl(url),
          profileUrn,
          memberNumericId,
          linkedinUsername,
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
        if (isInviteCreationUrl(url, requestBody)) {
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
        if (this.status < 200 || this.status >= 300 || !isInviteCreationUrl(requestUrl, requestBody)) {
          return;
        }

        postInvite(requestUrl, requestBody, typeof this.responseText === 'string' ? this.responseText : '');
      });
    }

    return originalSend.call(this, body);
  };
})();
