import type { FeedMembership, ProfileData, RelationshipState } from '../types';

interface RelationshipDeps {
  getCurrentProfileData: () => ProfileData | null;
  sendMessageToBackground: (message: Record<string, unknown>) => Promise<unknown>;
}

export function detectCurrentProfileRelationship(currentProfileData: ProfileData | null): RelationshipState {
  const scope = document.querySelector('.ph5.pb5') || document.querySelector('.pv-top-card') || document.body;

  const connectionDegree =
    (scope.querySelector('.dist-value')?.textContent?.trim() || currentProfileData?.connectionDegree || '').trim();

  const buttons = Array.from(scope.querySelectorAll('button')) as HTMLButtonElement[];
  const buttonText = buttons.map((button) => ({
    text: button.textContent?.trim().toLowerCase() || '',
    label: button.getAttribute('aria-label')?.trim().toLowerCase() || '',
  }));

  const hasPending = buttonText.some(
    ({ text, label }) => text === 'pending' || label.includes('withdraw invitation') || label.startsWith('pending')
  );
  const hasConnect = buttonText.some(
    ({ text, label }) => text === 'connect' || label.includes('invite') || label.includes('connect')
  );
  const hasMessage = buttonText.some(({ text, label }) => text === 'message' || label.startsWith('message'));
  const hasFollowing = buttonText.some(
    ({ text, label }) => text === 'following' || label.startsWith('following') || label.includes('unfollow')
  );
  const hasPremiumMessage = buttonText.some(({ label }) => label.includes('premium'));

  if (hasPending) {
    return { status: 'pending', connectionDegree, canMessage: false };
  }

  if (connectionDegree === '1st' || (hasMessage && !hasConnect && !hasPremiumMessage)) {
    return { status: 'connected', connectionDegree: '1st', canMessage: true };
  }

  if (hasConnect) {
    return { status: 'connect', connectionDegree, canMessage: false };
  }

  if (hasFollowing) {
    return { status: 'following', connectionDegree, canMessage: false };
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

  // Write isPremium only when DOM detection has a definitive signal.
  // Do NOT write false for statuses like 'connect'/'pending'/'following' where the DOM
  // alone cannot distinguish Premium InMail targets from regular non-connections.
  // The GraphQL refresh path (persistResolvedMemberState) is the authoritative stale-reset.
  if (relationship.status || typeof relationship.canMessage === 'boolean') {
    if (typeof relationship.isPremium === 'boolean') {
      // DOM detection produced an explicit Premium signal (true or false).
      updates.isPremium = relationship.isPremium;
    } else if (relationship.status === 'connected') {
      // 1st-degree connections are definitively not Premium InMail targets.
      updates.isPremium = false;
    }
    // For connect / pending / following without an explicit isPremium from DOM,
    // leave the stored value untouched — let GraphQL be authoritative.
  }

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
