import type { FeedMembership, ProfileData, RelationshipState } from '../types';
import {
  getRelationshipButtonSignal,
  hasFollowSignal,
  hasFollowingSignal,
} from '../../shared/relationship-dom-signals';

interface RelationshipDeps {
  getCurrentProfileData: () => ProfileData | null;
  sendMessageToBackground: (message: Record<string, unknown>) => Promise<unknown>;
}

function isFirstDegreeConnection(value?: string): boolean {
  return /^(1st|1st degree|1-й|1-го)$/i.test((value || '').trim());
}

function isNonFirstDegreeConnection(value?: string): boolean {
  return /^(2nd|3rd\+?|3rd|2-й|3-й|2-го|3-го)$/i.test((value || '').trim());
}

function buildCurrentProfileRelationshipUpdates(
  currentProfileData: ProfileData,
  relationship: RelationshipState
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (relationship.status) {
    updates.status = relationship.status;
  }

  if (relationship.connectionDegree) {
    updates.connectionDegree = relationship.connectionDegree;
    currentProfileData.connectionDegree = relationship.connectionDegree;
  }

  if (typeof relationship.canMessage === 'boolean') {
    updates.canMessage = relationship.canMessage;
  }

  if (typeof relationship.canFollow === 'boolean') {
    updates.canFollow = relationship.canFollow;
  }

  if (typeof relationship.canConnect === 'boolean') {
    updates.canConnect = relationship.canConnect;
  }

  if (typeof relationship.isFollowing === 'boolean') {
    updates.isFollowing = relationship.isFollowing;
    currentProfileData.isFollowing = relationship.isFollowing;
  }

  // Write isPremium only when DOM detection has a definitive signal.
  // Do NOT write false for statuses like 'connect'/'pending'/'following' where the DOM
  // alone cannot distinguish Premium InMail targets from regular non-connections.
  // The GraphQL refresh path (persistResolvedMemberState) is the authoritative stale-reset.
  if (relationship.status || typeof relationship.canMessage === 'boolean') {
    if (typeof relationship.isPremium === 'boolean') {
      updates.isPremium = relationship.isPremium;
    } else if (relationship.status === 'connected') {
      updates.isPremium = false;
    }
  }

  return updates;
}

export function detectCurrentProfileRelationship(currentProfileData: ProfileData | null): RelationshipState {
  const scope = document.querySelector('.ph5.pb5') || document.querySelector('.pv-top-card') || document.body;

  const connectionDegree =
    (scope.querySelector('.dist-value')?.textContent?.trim() || currentProfileData?.connectionDegree || '').trim();

  const buttons = Array.from(new Set([
    ...Array.from(scope.querySelectorAll('button')) as HTMLButtonElement[],
    ...Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[role="menu"] button, [role="menuitem"], .artdeco-dropdown__content button'
      )
    ),
  ]));
  const buttonText = buttons.map(getRelationshipButtonSignal);

  const hasPending = buttonText.some(
    ({ text, label }) =>
      text === 'pending' ||
      text.includes('розгляда') ||
      label.includes('withdraw invitation') ||
      label.includes('скасувати') ||
      label.startsWith('pending') ||
      label.includes('розгляда')
  );
  const hasConnect = buttonText.some(
    ({ text, label }) =>
      text === 'connect' ||
      text.includes('встановити контакт') ||
      label.includes('invite') ||
      label.includes('connect') ||
      label.includes('встановити контакт') ||
      label.includes('запрос')
  );
  const hasMessage = buttonText.some(
    ({ text, label }) =>
      text === 'message' ||
      text.includes('повідомлення') ||
      label.startsWith('message') ||
      label.includes('повідомлення')
  );
  const hasFollow = buttonText.some(hasFollowSignal);
  const hasExplicitFollowing = buttonText.some(hasFollowingSignal);
  const hasAuthoritativeFollowing = hasExplicitFollowing;
  const hasPremiumMessage = buttonText.some(({ label }) => label.includes('premium'));
  const hasFirstDegree = isFirstDegreeConnection(connectionDegree);
  const hasNonFirstDegree = isNonFirstDegreeConnection(connectionDegree);

  if (hasPending) {
    return {
      status: 'pending',
      connectionDegree,
      canMessage: hasMessage,
      canConnect: false,
      canFollow: hasAuthoritativeFollowing || hasFollow ? true : undefined,
      isFollowing: hasAuthoritativeFollowing ? true : hasFollow ? false : undefined,
      isPremium: hasMessage && hasPremiumMessage ? true : undefined,
    };
  }

  if (
    hasFirstDegree ||
    (hasMessage && !hasConnect && !hasPremiumMessage && !hasFollow && !hasAuthoritativeFollowing && !hasNonFirstDegree)
  ) {
    return { status: 'connected', connectionDegree: '1st', canMessage: true, canConnect: false };
  }

  if (hasConnect && hasAuthoritativeFollowing) {
    return {
      connectionDegree,
      canMessage: hasMessage,
      canFollow: true,
      canConnect: true,
      isFollowing: true,
      isPremium: hasMessage && hasPremiumMessage ? true : undefined,
    };
  }

  if (hasConnect) {
    return {
      status: 'connect',
      connectionDegree,
      canMessage: hasMessage,
      canConnect: true,
      canFollow: hasFollow ? true : undefined,
      isFollowing: hasFollow ? false : undefined,
      isPremium: hasMessage && hasPremiumMessage ? true : undefined,
    };
  }

  if (hasFollow && hasNonFirstDegree) {
    return {
      status: 'connect',
      connectionDegree,
      canMessage: hasMessage,
      canConnect: true,
      canFollow: true,
      isFollowing: false,
      isPremium: hasMessage && hasPremiumMessage ? true : undefined,
    };
  }

  if (hasAuthoritativeFollowing) {
    return {
      status: 'following',
      connectionDegree,
      canMessage: hasMessage,
      canFollow: true,
      canConnect: false,
      isFollowing: true,
      isPremium: hasMessage && hasPremiumMessage ? true : undefined,
    };
  }

  // Premium profile: LinkedIn shows a Message button that routes through InMail.
  // The button aria-label contains "premium". We enable messaging and mark the profile as Premium.
  if (hasMessage && hasPremiumMessage) {
    return { connectionDegree, canMessage: true, isPremium: true };
  }

  return { connectionDegree };
}

export async function syncCurrentProfileMembershipStatuses(
  memberships: FeedMembership[],
  deps: RelationshipDeps
): Promise<void> {
  const currentProfileData = deps.getCurrentProfileData();
  if (!currentProfileData || memberships.length === 0) {
    return;
  }

  const relationship = detectCurrentProfileRelationship(currentProfileData);
  const updates = buildCurrentProfileRelationshipUpdates(currentProfileData, relationship);

  if (Object.keys(updates).length === 0) {
    return;
  }

  await Promise.all(
    memberships.map((membership) =>
      deps.sendMessageToBackground({
        type: 'FEEDS_UPDATE_MEMBER',
        feedId: membership.feedId,
        memberId: membership.memberId,
        updates,
      })
    )
  );

  console.log(
    `[LFS] synced current profile memberships: username=${currentProfileData.linkedinUsername}, status=${relationship.status || 'n/a'}, connectionDegree=${relationship.connectionDegree || 'n/a'}`
  );
}

export async function syncCurrentProfileViewerStatus(deps: RelationshipDeps): Promise<void> {
  const currentProfileData = deps.getCurrentProfileData();
  if (!currentProfileData?.linkedinUsername) {
    return;
  }

  const relationship = detectCurrentProfileRelationship(currentProfileData);
  const updates = buildCurrentProfileRelationshipUpdates(currentProfileData, relationship);
  if (Object.keys(updates).length === 0) {
    return;
  }

  updates.statusResolvedAt = Date.now();
  updates.linkedinUsername = currentProfileData.linkedinUsername;
  updates.linkedinUrl = currentProfileData.linkedinUrl;
  updates.displayName = currentProfileData.displayName;
  if (currentProfileData.profileUrn) {
    updates.profileUrn = currentProfileData.profileUrn;
  }
  if (currentProfileData.memberNumericId || currentProfileData.memberId) {
    updates.memberNumericId = currentProfileData.memberNumericId || currentProfileData.memberId;
  }

  try {
    const response = (await deps.sendMessageToBackground({
      type: 'PROFILE_VIEWERS_UPDATE',
      viewerId: currentProfileData.linkedinUsername,
      updates,
      notifyProfileViewersChanged: true,
    })) as { success?: boolean; error?: string } | null;
    if (response?.success === false) {
      console.warn(
        `[LFS] skipped current profile viewer sync: username=${currentProfileData.linkedinUsername}, error=${response.error || 'unknown'}`
      );
      return;
    }
  } catch (error) {
    console.warn(
      `[LFS] failed to sync current profile viewer: username=${currentProfileData.linkedinUsername}`,
      error
    );
    return;
  }

  console.log(
    `[LFS] synced current profile viewer: username=${currentProfileData.linkedinUsername}, status=${relationship.status || 'n/a'}, connectionDegree=${relationship.connectionDegree || 'n/a'}`
  );
}
