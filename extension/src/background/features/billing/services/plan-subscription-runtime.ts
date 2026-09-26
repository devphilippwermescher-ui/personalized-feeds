import { subscribeBillingSubscription } from 'shared/firestore-service';
import { createUserPlanSnapshot } from 'shared/plans';
import { getCurrentUser, onAuthChange } from '../../../../services/auth';
import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';
import { clearUserPlanCache } from './plan-service';

const LINKEDIN_TAB_PATTERN = 'https://www.linkedin.com/*';

let activeUserId: string | null = null;
let unsubscribe: (() => void) | null = null;
let startInFlight: Promise<void> | null = null;
let authListenerRegistered = false;

async function notifyLinkedInTabs(plan: 'free' | 'pro'): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LINKEDIN_TAB_PATTERN });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id, {
            type: 'PLAN_SUBSCRIPTION_UPDATED',
            plan,
          })
          .catch(() => {
            // A LinkedIn tab may not have the sidebar content script yet.
          })
      )
  );
}

export function stopPlanSubscriptionRuntime(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (activeUserId) clearUserPlanCache(activeUserId);
  activeUserId = null;
}

export function startPlanSubscriptionRuntime(): Promise<void> {
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    const user = await getAuthenticatedFeedsUser();
    if (!user || getCurrentUser()?.uid !== user.uid) {
      stopPlanSubscriptionRuntime();
      return;
    }

    if (activeUserId === user.uid && unsubscribe) return;

    stopPlanSubscriptionRuntime();
    activeUserId = user.uid;
    unsubscribe = subscribeBillingSubscription(
      user.uid,
      (subscription) => {
        clearUserPlanCache(user.uid);
        void notifyLinkedInTabs(createUserPlanSnapshot(subscription).plan);
      },
      (error) => {
        console.warn('[plan] Subscription listener stopped', {
          userId: user.uid,
          error: error.message,
        });
        stopPlanSubscriptionRuntime();
      }
    );
  })().finally(() => {
    startInFlight = null;
  });

  return startInFlight;
}

export function registerPlanSubscriptionRuntime(): void {
  if (authListenerRegistered) return;
  authListenerRegistered = true;

  onAuthChange((user) => {
    if (!user) {
      stopPlanSubscriptionRuntime();
      return;
    }

    void startPlanSubscriptionRuntime().catch((error) => {
      console.warn('[plan] Subscription runtime could not start', error);
    });
  });
}
