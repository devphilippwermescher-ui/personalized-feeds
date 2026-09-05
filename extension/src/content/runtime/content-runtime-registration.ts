import { CONTENT_RUNTIME_REGISTRATION_MARKER } from '../../shared/content-runtime';

export interface ContentRuntimeRegistration {
  buildId: string;
  dispose: () => void;
  refresh: () => void;
}

type RuntimeRegistrationHost = Window & {
  __myFeedPilotContentRuntimeRegistration__?: ContentRuntimeRegistration;
};

/**
 * An unpacked-extension Reload invalidates the old Chrome API context without
 * refreshing the LinkedIn tab. Replace that stale runtime when a newly built
 * content bundle is injected. Always replace an existing registration: after
 * chrome://extensions Reload, a stale registration can have the same buildId
 * while its Chrome messaging context is already invalid.
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

  try {
    previousRegistration?.dispose();
  } catch {
    // Cleanup is best-effort because Chrome invalidates old extension APIs.
  }

  initialize();
  runtimeHost[CONTENT_RUNTIME_REGISTRATION_MARKER] = { buildId, dispose, refresh };
  return true;
}
