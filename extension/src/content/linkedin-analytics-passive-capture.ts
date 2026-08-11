const MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE';
const PING_MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE_PING';
const SSI_REQUEST_MESSAGE_TYPE = 'MFP_LINKEDIN_SSI_REQUEST';
const SSI_RESPONSE_MESSAGE_TYPE = 'MFP_LINKEDIN_SSI_RESPONSE';
const PROFILE_METADATA_CHANGED_MESSAGE_TYPE = 'MFP_LINKEDIN_PROFILE_METADATA_CHANGED';
const SSI_BRIDGE_TIMEOUT_MS = 12_000;
const PROFILE_METADATA_SETTLE_DELAY_MS = 1_000;

interface PassiveAnalyticsWindowMessage {
  type?: string;
  sourceUrl?: unknown;
  capturedAt?: unknown;
  connectionsCount?: unknown;
  followersCount?: unknown;
  followersExact?: unknown;
  socialSellingIndexScore?: unknown;
  requestId?: unknown;
  response?: unknown;
  mutation?: unknown;
}

interface LinkedInSsiBridgeResponse {
  ok: boolean;
  status?: number;
  payload?: unknown;
  error?: string;
}

function requestSocialSellingIndexFromMainWorld(): Promise<LinkedInSsiBridgeResponse> {
  return new Promise((resolve) => {
    const requestId = `mfp-ssi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', onResponse);
      resolve({ ok: false, error: `LinkedIn SSI bridge timed out after ${SSI_BRIDGE_TIMEOUT_MS}ms` });
    }, SSI_BRIDGE_TIMEOUT_MS);

    const onResponse = (event: MessageEvent<PassiveAnalyticsWindowMessage>) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.type !== SSI_RESPONSE_MESSAGE_TYPE ||
        event.data.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', onResponse);
      const response = event.data.response;
      resolve(response && typeof response === 'object' ? (response as LinkedInSsiBridgeResponse) : { ok: false });
    };

    window.addEventListener('message', onResponse);
    window.postMessage({ type: SSI_REQUEST_MESSAGE_TYPE, requestId }, window.location.origin);
  });
}

export function initLinkedInAnalyticsPassiveCapture(): void {
  let metadataChangeTimer: number | undefined;
  window.addEventListener('message', (event: MessageEvent<PassiveAnalyticsWindowMessage>) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type === MESSAGE_TYPE) {
      void chrome.runtime.sendMessage({
        type: 'PROFILE_ANALYTICS_PASSIVE_CAPTURE',
        capture: {
          sourceUrl: event.data.sourceUrl,
          capturedAt: event.data.capturedAt,
          connectionsCount: event.data.connectionsCount,
          followersCount: event.data.followersCount,
          followersExact: event.data.followersExact,
          socialSellingIndexScore: event.data.socialSellingIndexScore,
        },
      });
      return;
    }
    if (event.data?.type !== PROFILE_METADATA_CHANGED_MESSAGE_TYPE) return;
    window.clearTimeout(metadataChangeTimer);
    metadataChangeTimer = window.setTimeout(() => {
      void chrome.runtime.sendMessage({
        type: 'PROFILE_ANALYTICS_PROFILE_METADATA_CHANGED',
        mutation: event.data.mutation,
        sourceUrl: event.data.sourceUrl,
        capturedAt: event.data.capturedAt,
      });
    }, PROFILE_METADATA_SETTLE_DELAY_MS);
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'PROFILE_ANALYTICS_FETCH_SSI') return false;
    void requestSocialSellingIndexFromMainWorld().then(sendResponse);
    return true;
  });
  window.postMessage({ type: PING_MESSAGE_TYPE }, window.location.origin);
}
