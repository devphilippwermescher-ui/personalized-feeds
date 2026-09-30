export const CONTENT_RUNTIME_PING = 'MYFEEDPILOT_CONTENT_RUNTIME_PING';
export const CONTENT_RUNTIME_REFRESH = 'MYFEEDPILOT_CONTENT_RUNTIME_REFRESH';
export const CONTENT_RUNTIME_REGISTRATION_MARKER = '__myFeedPilotContentRuntimeRegistration__';
export const CONTENT_RUNTIME_REPLACEMENT_MARKER = '__myFeedPilotContentRuntimeReplacementRequested__';

export interface ContentRuntimePingMessage {
  type: typeof CONTENT_RUNTIME_PING;
}

export interface ContentRuntimeRefreshMessage {
  type: typeof CONTENT_RUNTIME_REFRESH;
}

export type ContentRuntimeMessage = ContentRuntimePingMessage | ContentRuntimeRefreshMessage;

export interface ContentRuntimePingResponse {
  ready: true;
}
