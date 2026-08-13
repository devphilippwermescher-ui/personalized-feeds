import { collection, doc, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type {
  Feed,
  FeedMember,
  FeedShareAccess,
  ProfileAnalyticsDailySnapshot,
  ProfileAnalyticsConnectionInvite,
  ProfileAnalyticsSnapshot,
  ProfileViewer,
  ProfileViewerSearch,
} from '../types';

export function feedsCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'feeds');
}

export function membersCollection(userId: string, feedId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'feeds', feedId, 'members');
}

export function sharesCollection(userId: string, feedId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'feeds', feedId, 'shares');
}

export function followedFeedsCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'followedFeeds');
}

export function profileViewersCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileViewers');
}

export function profileViewerSearchesCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileViewerSearches');
}

export function profileViewerSummaryDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileViewerMetadata', 'summary');
}

export function profileAnalyticsDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileAnalytics', 'current');
}

export function profileAnalyticsDailyCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileAnalyticsDaily');
}

export function profileAnalyticsDailyDoc(userId: string, date: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileAnalyticsDaily', date);
}

export function profileAnalyticsSampleDoc(userId: string, timestamp: number) {
  return doc(getFirebaseDb(), 'users', userId, 'profileAnalyticsSamples', String(timestamp));
}

export function profileConnectionInviteDoc(userId: string, linkedinUsername: string) {
  return doc(getFirebaseDb(), 'users', userId, 'connectionInvites', linkedinUsername);
}

export function legacyProfileAnalyticsDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileViewerMetadata', 'profileAnalytics');
}

export function legacyProfileAnalyticsDailyCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileViewerMetadata');
}

export function legacyConnectionInvitesCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileViewerMetadata');
}

export function legacyProfileConnectionInviteDoc(userId: string, linkedinUsername: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileViewerMetadata', `connectionInvite_${linkedinUsername}`);
}

export function profileAnalyticsHistoryJobDoc(userId: string, jobId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileAnalyticsJobs', jobId);
}

export function profileAnalyticsMigrationDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileAnalyticsJobs', 'storageMigrationV2');
}

export function profileAnalyticsHistoryChunksCollection(userId: string) {
  return collection(getFirebaseDb(), 'users', userId, 'profileAnalyticsHistoryChunks');
}

export function profileAnalyticsHistoryChunkDoc(userId: string, chunkId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'profileAnalyticsHistoryChunks', chunkId);
}

export function emailIndexCollection() {
  return collection(getFirebaseDb(), 'emailIndex');
}

export function shareLinksCollection() {
  return collection(getFirebaseDb(), 'feedShareLinks');
}

export function settingsDoc(userId: string) {
  return doc(getFirebaseDb(), 'users', userId, 'settings', 'preferences');
}

export function docToFeed(d: QueryDocumentSnapshot<DocumentData, DocumentData>): Feed {
  return { id: d.id, ...d.data() } as Feed;
}

export function docToMember(d: QueryDocumentSnapshot<DocumentData, DocumentData>): FeedMember {
  return { id: d.id, ...d.data() } as FeedMember;
}

export function docToShareAccess(d: QueryDocumentSnapshot<DocumentData, DocumentData>): FeedShareAccess {
  return d.data() as FeedShareAccess;
}

export function docToProfileViewer(d: QueryDocumentSnapshot<DocumentData, DocumentData>): ProfileViewer {
  return { id: d.id, ...d.data() } as ProfileViewer;
}

export function docToProfileViewerSearch(d: QueryDocumentSnapshot<DocumentData, DocumentData>): ProfileViewerSearch {
  return { id: d.id, ...d.data() } as ProfileViewerSearch;
}

export function docToProfileAnalyticsSnapshot(
  d: QueryDocumentSnapshot<DocumentData, DocumentData>
): ProfileAnalyticsSnapshot {
  return d.data() as ProfileAnalyticsSnapshot;
}

export function docToProfileAnalyticsDailySnapshot(
  d: QueryDocumentSnapshot<DocumentData, DocumentData>
): ProfileAnalyticsDailySnapshot {
  return { id: d.id, ...d.data() } as ProfileAnalyticsDailySnapshot;
}

export function docToProfileAnalyticsConnectionInvite(
  d: QueryDocumentSnapshot<DocumentData, DocumentData>
): ProfileAnalyticsConnectionInvite {
  return { id: d.id, ...d.data() } as ProfileAnalyticsConnectionInvite;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
