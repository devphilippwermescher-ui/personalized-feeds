import { arrayUnion, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';

const BILLING_NOTICE_SETTINGS_ID = 'billingNotices';

function billingNoticeSettingsDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', BILLING_NOTICE_SETTINGS_ID);
}

function parseDismissedNoticeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function getDismissedBillingNoticeIds(userId: string): Promise<string[]> {
  const snapshot = await getDoc(billingNoticeSettingsDoc(userId));
  return snapshot.exists() ? parseDismissedNoticeIds(snapshot.get('dismissedNoticeIds')) : [];
}

export function subscribeDismissedBillingNoticeIds(
  userId: string,
  onDismissedNoticeIds: (ids: string[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    billingNoticeSettingsDoc(userId),
    (snapshot) => {
      onDismissedNoticeIds(snapshot.exists() ? parseDismissedNoticeIds(snapshot.get('dismissedNoticeIds')) : []);
    },
    (error) => onError?.(error)
  );
}

export async function dismissBillingNotice(userId: string, noticeId: string): Promise<void> {
  await setDoc(
    billingNoticeSettingsDoc(userId),
    {
      dismissedNoticeIds: arrayUnion(noticeId),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}
