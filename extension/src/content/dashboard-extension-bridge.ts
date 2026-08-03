const REQUEST_TYPE = 'MFP_DASHBOARD_EXTENSION_REQUEST';
const RESPONSE_TYPE = 'MFP_DASHBOARD_EXTENSION_RESPONSE';
const ALLOWED_MESSAGE_TYPE = 'DASHBOARD_PROFILE_ANALYTICS_SYNC_NOW';

interface DashboardBridgeRequest {
  type?: string;
  requestId?: string;
  message?: {
    type?: string;
  };
}

function respond(requestId: string, response: unknown): void {
  window.postMessage({
    type: RESPONSE_TYPE,
    requestId,
    response,
  }, window.location.origin);
}

window.addEventListener('message', (event: MessageEvent<DashboardBridgeRequest>) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const request = event.data;
  if (
    request?.type !== REQUEST_TYPE ||
    !request.requestId ||
    request.message?.type !== ALLOWED_MESSAGE_TYPE
  ) {
    return;
  }

  chrome.runtime.sendMessage({
    type: 'DASHBOARD_EXTENSION_BRIDGE_REQUEST',
    dashboardMessage: request.message,
  }, (response) => {
    if (chrome.runtime.lastError) {
      respond(request.requestId || '', {
        success: false,
        error: chrome.runtime.lastError.message,
      });
      return;
    }

    respond(request.requestId || '', response);
  });
});