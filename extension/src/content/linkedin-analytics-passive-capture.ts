const MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE';
const PING_MESSAGE_TYPE = 'MFP_LINKEDIN_ANALYTICS_PASSIVE_CAPTURE_PING';

interface PassiveAnalyticsWindowMessage {
  type?: string;
  sourceUrl?: unknown;
  capturedAt?: unknown;
  connectionsCount?: unknown;
  followersCount?: unknown;
  followersExact?: unknown;
}

export function initLinkedInAnalyticsPassiveCapture(): void {
  window.addEventListener('message', (event: MessageEvent<PassiveAnalyticsWindowMessage>) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.type !== MESSAGE_TYPE) return;
    void chrome.runtime.sendMessage({
      type: 'PROFILE_ANALYTICS_PASSIVE_CAPTURE',
      capture: {
        sourceUrl: event.data.sourceUrl,
        capturedAt: event.data.capturedAt,
        connectionsCount: event.data.connectionsCount,
        followersCount: event.data.followersCount,
        followersExact: event.data.followersExact,
      },
    });
  });
  window.postMessage({ type: PING_MESSAGE_TYPE }, window.location.origin);
}
