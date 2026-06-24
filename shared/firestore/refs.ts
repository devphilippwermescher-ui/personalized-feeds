import {
  collection,
  doc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase-config';
import type {
  Feed,
  FeedMember,
  FeedShareAccess,
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

export function docToShareAccess(
  d: QueryDocumentSnapshot<DocumentData, DocumentData>
): FeedShareAccess {
  return d.data() as FeedShareAccess;
}

export function docToProfileViewer(
  d: QueryDocumentSnapshot<DocumentData, DocumentData>
): ProfileViewer {
  return { id: d.id, ...d.data() } as ProfileViewer;
}

export function docToProfileViewerSearch(
  d: QueryDocumentSnapshot<DocumentData, DocumentData>
): ProfileViewerSearch {
  return { id: d.id, ...d.data() } as ProfileViewerSearch;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
