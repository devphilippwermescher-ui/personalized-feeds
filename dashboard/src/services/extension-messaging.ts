const REQUEST_TYPE = 'MFP_DASHBOARD_EXTENSION_REQUEST';
const RESPONSE_TYPE = 'MFP_DASHBOARD_EXTENSION_RESPONSE';
const REQUEST_TIMEOUT_MS = 10_000;
let requestSequence = 0;

interface BridgeResponseEvent {
  type?: string;
  requestId?: string;
  response?: unknown;
}

function unavailableResponse<TResponse>(error: string): TResponse {
  return {
    success: false,
    error,
  } as TResponse;
}

export function sendMessageToExtension<TResponse>(
  message: Record<string, unknown>,
  options: { timeoutMs?: number } = {}
): Promise<TResponse> {
  return new Promise((resolve) => {
    const requestId = `profile-analytics-${Date.now()}-${requestSequence += 1}`;
    let completed = false;

    const finish = (response: TResponse) => {
      if (completed) {
        return;
      }

      completed = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleResponse);
      resolve(response);
    };

    const handleResponse = (event: MessageEvent<BridgeResponseEvent>) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        event.data?.type !== RESPONSE_TYPE ||
        event.data.requestId !== requestId
      ) {
        return;
      }

      finish(event.data.response as TResponse);
    };

    const timeout = window.setTimeout(() => {
      finish(unavailableResponse<TResponse>('myFeedPilot extension is not available on this dashboard page.'));
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);

    window.addEventListener('message', handleResponse);
    window.postMessage({
      type: REQUEST_TYPE,
      requestId,
      message,
    }, window.location.origin);
  });
}
