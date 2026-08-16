const REQUEST_TYPE = 'MFP_DASHBOARD_EXTENSION_REQUEST';
const RESPONSE_TYPE = 'MFP_DASHBOARD_EXTENSION_RESPONSE';
const ALLOWED_MESSAGE_TYPES = new Set([
  'DASHBOARD_GET_EXTENSION_AUTH_STATE',
  'DASHBOARD_SYNC_AUTH',
  'DASHBOARD_SYNC_SETTINGS',
  'DASHBOARD_PROFILE_ANALYTICS_OPENED',
  'DASHBOARD_GET_PROFILE_ANALYTICS_SYNC_STATUS',
  'DASHBOARD_RESUME_PROFILE_ANALYTICS_HISTORY',
]);

interface DashboardBridgeRequest {
  type?: string;
  requestId?: string;
  message?: {
    type?: string;
  };
}

function respond(requestId: string, response: unknown): void {
  window.postMessage(
    {
      type: RESPONSE_TYPE,
      requestId,
      response,
    },
    window.location.origin
  );
}

window.addEventListener('message', (event: MessageEvent<DashboardBridgeRequest>) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const request = event.data;
  if (
    request?.type !== REQUEST_TYPE ||
    !request.requestId ||
    !request.message?.type ||
    !ALLOWED_MESSAGE_TYPES.has(request.message.type)
  ) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: 'DASHBOARD_EXTENSION_BRIDGE_REQUEST',
      dashboardMessage: request.message,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        respond(request.requestId || '', {
          success: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      respond(request.requestId || '', response);
    }
  );
});
