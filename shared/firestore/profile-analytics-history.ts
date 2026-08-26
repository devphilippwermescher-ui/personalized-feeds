import { deleteField, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type {
  ProfileAnalyticsConnectionHistoryChunk,
  ProfileAnalyticsConnectionHistoryJob,
  ProfileAnalyticsProfileSnapshot,
} from '../types';
import {
  profileAnalyticsHistoryChunkDoc,
  profileAnalyticsHistoryChunksCollection,
  profileAnalyticsHistoryJobDoc,
} from './refs';

export const PROFILE_ANALYTICS_CONNECTION_HISTORY_VERSION = 2;

export function getProfileAnalyticsConnectionAccountKey(
  profile: Pick<ProfileAnalyticsProfileSnapshot, 'profileUrn' | 'memberNumericId' | 'linkedinUsername'>
): string {
  return profile.profileUrn || profile.memberNumericId || profile.linkedinUsername.trim().toLowerCase();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getProfileAnalyticsConnectionHistoryJobId(accountKey: string): string {
  return `connectionsBootstrap_${stableHash(accountKey)}`;
}

export async function getProfileAnalyticsConnectionHistoryJob(
  userId: string,
  accountKey: string
): Promise<ProfileAnalyticsConnectionHistoryJob | null> {
  const id = getProfileAnalyticsConnectionHistoryJobId(accountKey);
  const snapshot = await getDoc(profileAnalyticsHistoryJobDoc(userId, id));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ProfileAnalyticsConnectionHistoryJob) : null;
}

export async function setProfileAnalyticsConnectionHistoryJob(
  userId: string,
  job: ProfileAnalyticsConnectionHistoryJob
): Promise<void> {
  const { id, ...data } = job;
  // History jobs are merged so a resumed batch cannot erase progress written
  // by a previous service-worker lifetime. Firestore rejects JavaScript
  // `undefined`, and simply omitting such keys would preserve stale retry/error
  // fields. Convert them to delete sentinels instead.
  const firestoreData = toProfileAnalyticsConnectionHistoryJobData(data);
  await setDoc(profileAnalyticsHistoryJobDoc(userId, id), firestoreData, { merge: true });
}

export function toProfileAnalyticsConnectionHistoryJobData(
  data: Omit<ProfileAnalyticsConnectionHistoryJob, 'id'>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === undefined ? deleteField() : value])
  );
}

export async function writeProfileAnalyticsConnectionHistoryChunk(
  userId: string,
  chunk: ProfileAnalyticsConnectionHistoryChunk
): Promise<void> {
  const { id, ...data } = chunk;
  await setDoc(profileAnalyticsHistoryChunkDoc(userId, id), data);
}

export async function getProfileAnalyticsConnectionHistoryChunks(
  userId: string,
  sessionId: string
): Promise<ProfileAnalyticsConnectionHistoryChunk[]> {
  const snapshot = await getDocs(
    query(profileAnalyticsHistoryChunksCollection(userId), where('sessionId', '==', sessionId))
  );
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }) as ProfileAnalyticsConnectionHistoryChunk)
    .sort((left, right) => left.batchIndex - right.batchIndex);
}
