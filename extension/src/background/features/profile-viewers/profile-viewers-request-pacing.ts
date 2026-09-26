// Keep first-time and follow-up pagination sequential and paced. This mirrors
// the safe cadence used by the one-time Connections history import and avoids
// turning a full Profile Viewers backfill into a burst of LinkedIn requests.
export const PROFILE_VIEWERS_PAGINATION_DELAY_MS = 1_125;

export function waitForProfileViewersPaginationPace(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PROFILE_VIEWERS_PAGINATION_DELAY_MS);
  });
}
