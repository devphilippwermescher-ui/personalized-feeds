import { CONTENT_RUNTIME_REGISTRATION_MARKER, CONTENT_RUNTIME_REPLACEMENT_MARKER } from '../../shared/content-runtime';

export interface ContentRuntimeRegistration {
  buildId: string;
  dispose: () => void;
  refresh: () => void;
}

type RuntimeRegistrationHost = Window & {
  __myFeedPilotContentRuntimeRegistration__?: ContentRuntimeRegistration;
  __myFeedPilotContentRuntimeReplacementRequested__?: boolean;
};

/**
 * A healthy same-build runtime owns the current observers and should only be
 * refreshed when content.js is evaluated twice during page startup. Background
 * recovery explicitly marks an unresponsive runtime for replacement before it
 * injects a new copy of content.js.
 */
export function registerContentRuntime(
  host: Window,
  buildId: string,
  initialize: () => void,
  dispose: () => void,
  refresh: () => void = initialize
): boolean {
  const runtimeHost = host as RuntimeRegistrationHost;
  const previousRegistration = runtimeHost[CONTENT_RUNTIME_REGISTRATION_MARKER];
  const replacementRequested = runtimeHost[CONTENT_RUNTIME_REPLACEMENT_MARKER] === true;
  delete runtimeHost[CONTENT_RUNTIME_REPLACEMENT_MARKER];

  if (previousRegistration?.buildId === buildId && !replacementRequested) {
    try {
      previousRegistration.refresh();
      return false;
    } catch {
      // A same-build marker can outlive its invalidated Chrome context.
    }
  }

  try {
    previousRegistration?.dispose();
  } catch {
    // Cleanup is best-effort because Chrome invalidates old extension APIs.
  }

  initialize();
  runtimeHost[CONTENT_RUNTIME_REGISTRATION_MARKER] = { buildId, dispose, refresh };
  return true;
}
