import {
  dismissBillingNotice,
  getBillingPaymentStatus,
  getBillingSubscription,
  getDismissedBillingNoticeIds,
  subscribeBillingPaymentStatus,
  subscribeBillingSubscription,
  subscribeDismissedBillingNoticeIds,
} from 'shared/firestore-service';
import { resolveBillingNotice, type BillingNotice } from 'shared/billing-notices';
import type { BillingPaymentStatus } from 'shared/billing-payment-status';
import { createUserPlanSnapshot, type BillingSubscription } from 'shared/plans';
import { getCurrentUser, onAuthChange } from '../../../../services/auth';
import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';
import { clearUserPlanCache } from './plan-service';

const LINKEDIN_TAB_PATTERN = 'https://www.linkedin.com/*';
export const BILLING_NOTICE_ALARM_NAME = 'billing-notice-check';
const BILLING_NOTICE_CHECK_INTERVAL_MINUTES = 6 * 60;

let activeUserId: string | null = null;
let unsubscribePaymentStatus: (() => void) | null = null;
let unsubscribeSubscription: (() => void) | null = null;
let unsubscribeDismissals: (() => void) | null = null;
let startInFlight: Promise<BillingNotice | null> | null = null;
let authListenerRegistered = false;
let currentSubscription: BillingSubscription | null = null;
let currentPaymentStatus: BillingPaymentStatus | null = null;
let dismissedNoticeIds = new Set<string>();
let currentNotice: BillingNotice | null = null;

async function notifyLinkedInTabs(message: Record<string, unknown>): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LINKEDIN_TAB_PATTERN });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // A LinkedIn tab may not have the sidebar content script yet.
        })
      )
  );
}

function resolveVisibleNotice(): BillingNotice | null {
  const notice = resolveBillingNotice(currentSubscription, Date.now(), currentPaymentStatus);
  return notice && !dismissedNoticeIds.has(notice.id) ? notice : null;
}

function publishBillingState(): void {
  const plan = createUserPlanSnapshot(currentSubscription).plan;
  currentNotice = resolveVisibleNotice();
  void notifyLinkedInTabs({ type: 'PLAN_SUBSCRIPTION_UPDATED', plan });
  void notifyLinkedInTabs({ type: 'BILLING_NOTICE_UPDATED', notice: currentNotice });
}

function ensureBillingNoticeAlarm(): void {
  if (!chrome.alarms) return;
  void chrome.alarms.get(BILLING_NOTICE_ALARM_NAME).then((alarm) => {
    if (alarm) return;
    chrome.alarms.create(BILLING_NOTICE_ALARM_NAME, {
      periodInMinutes: BILLING_NOTICE_CHECK_INTERVAL_MINUTES,
    });
  });
}

export function stopPlanSubscriptionRuntime(): void {
  unsubscribePaymentStatus?.();
  unsubscribeSubscription?.();
  unsubscribeDismissals?.();
  unsubscribePaymentStatus = null;
  unsubscribeSubscription = null;
  unsubscribeDismissals = null;
  if (activeUserId) clearUserPlanCache(activeUserId);
  activeUserId = null;
  currentSubscription = null;
  currentPaymentStatus = null;
  dismissedNoticeIds = new Set();
  currentNotice = null;
  void notifyLinkedInTabs({ type: 'BILLING_NOTICE_UPDATED', notice: null });
}

export function startPlanSubscriptionRuntime(): Promise<BillingNotice | null> {
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    const user = await getAuthenticatedFeedsUser();
    if (!user || getCurrentUser()?.uid !== user.uid) {
      stopPlanSubscriptionRuntime();
      return null;
    }

    if (activeUserId === user.uid && unsubscribeSubscription && unsubscribePaymentStatus && unsubscribeDismissals) {
      currentNotice = resolveVisibleNotice();
      return currentNotice;
    }

    stopPlanSubscriptionRuntime();
    activeUserId = user.uid;
    const [subscription, paymentStatus, dismissedIds] = await Promise.all([
      getBillingSubscription(user.uid),
      getBillingPaymentStatus(user.uid),
      getDismissedBillingNoticeIds(user.uid),
    ]);
    currentSubscription = subscription;
    currentPaymentStatus = paymentStatus;
    dismissedNoticeIds = new Set(dismissedIds);
    currentNotice = resolveVisibleNotice();

    unsubscribeSubscription = subscribeBillingSubscription(
      user.uid,
      (subscription) => {
        currentSubscription = subscription;
        clearUserPlanCache(user.uid);
        publishBillingState();
      },
      (error) => {
        console.warn('[plan] Subscription listener stopped', {
          userId: user.uid,
          error: error.message,
        });
        stopPlanSubscriptionRuntime();
      }
    );
    unsubscribePaymentStatus = subscribeBillingPaymentStatus(
      user.uid,
      (status) => {
        currentPaymentStatus = status;
        publishBillingState();
      },
      (error) => {
        console.warn('[billing-notice] Payment status listener stopped', {
          userId: user.uid,
          error: error.message,
        });
        stopPlanSubscriptionRuntime();
      }
    );
    unsubscribeDismissals = subscribeDismissedBillingNoticeIds(
      user.uid,
      (ids) => {
        dismissedNoticeIds = new Set(ids);
        currentNotice = resolveVisibleNotice();
        void notifyLinkedInTabs({ type: 'BILLING_NOTICE_UPDATED', notice: currentNotice });
      },
      (error) => {
        console.warn('[billing-notice] Dismissal listener stopped', {
          userId: user.uid,
          error: error.message,
        });
        stopPlanSubscriptionRuntime();
      }
    );

    ensureBillingNoticeAlarm();
    publishBillingState();
    return currentNotice;
  })().finally(() => {
    startInFlight = null;
  });

  return startInFlight;
}

export async function refreshBillingNoticeRuntime(): Promise<BillingNotice | null> {
  await startPlanSubscriptionRuntime();
  currentNotice = resolveVisibleNotice();
  publishBillingState();
  return currentNotice;
}

export async function dismissCurrentBillingNotice(noticeId: string): Promise<void> {
  const user = await getAuthenticatedFeedsUser();
  if (!user || user.uid !== activeUserId) throw new Error('Sign in to dismiss this billing notification.');
  const notice = resolveVisibleNotice();
  if (!notice || notice.id !== noticeId) throw new Error('This billing notification is no longer active.');
  await dismissBillingNotice(user.uid, noticeId);
  dismissedNoticeIds.add(noticeId);
  currentNotice = null;
  void notifyLinkedInTabs({ type: 'BILLING_NOTICE_UPDATED', notice: null });
}

export function registerPlanSubscriptionRuntime(): void {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  ensureBillingNoticeAlarm();

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
