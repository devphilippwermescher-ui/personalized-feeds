export const PLAN_REFRESH_REQUESTED_EVENT = 'mfp:plan-refresh-requested';

export function requestPlanRefresh(): void {
  document.dispatchEvent(new Event(PLAN_REFRESH_REQUESTED_EVENT));
}

export function onPlanRefreshRequested(listener: () => void): () => void {
  document.addEventListener(PLAN_REFRESH_REQUESTED_EVENT, listener);
  return () => document.removeEventListener(PLAN_REFRESH_REQUESTED_EVENT, listener);
}
