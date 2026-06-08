import type { LinkedInProfileData } from '../../../../shared/types';
import { getCanonicalLinkedInUsername } from '../../../../shared/linkedin-identity';
import type { FeedMemberInfo } from '../feeds-sidebar/types';
import { fetchLinkedInRelationshipStatus } from '../linkedin-relationship-status';

function toTemporaryMember(profileData: LinkedInProfileData): FeedMemberInfo {
  return {
    id: profileData.profileUrn || profileData.linkedinUrl || profileData.linkedinUsername,
    linkedinUrl: profileData.linkedinUrl,
    linkedinUsername: getCanonicalLinkedInUsername(profileData),
    profileUrn: profileData.profileUrn,
    memberNumericId: profileData.memberNumericId || profileData.memberId,
    canMessage: profileData.canMessage,
    canFollow: profileData.canFollow,
    canConnect: profileData.canConnect,
    isFollowing: profileData.isFollowing,
    displayName: profileData.displayName,
    headline: profileData.headline,
    profileImageUrl: profileData.profileImageUrl,
    company: profileData.company,
    location: profileData.location,
    connectionDegree: profileData.connectionDegree,
    addedAt: Date.now(),
  };
}

export async function enrichProfileDataForFeed(profileData: LinkedInProfileData): Promise<LinkedInProfileData> {
  const temporaryMember = toTemporaryMember(profileData);

  try {
    const relationship = await fetchLinkedInRelationshipStatus(temporaryMember);
    return {
      ...profileData,
      linkedinUrl: temporaryMember.linkedinUrl,
      linkedinUsername: temporaryMember.linkedinUsername,
      profileUrn: relationship.profileUrn || temporaryMember.profileUrn || profileData.profileUrn,
      memberNumericId:
        relationship.memberNumericId ||
        temporaryMember.memberNumericId ||
        profileData.memberNumericId ||
        profileData.memberId,
      canMessage: typeof relationship.canMessage === 'boolean' ? relationship.canMessage : profileData.canMessage,
      canFollow: typeof relationship.canFollow === 'boolean' ? relationship.canFollow : profileData.canFollow,
      canConnect: typeof relationship.canConnect === 'boolean' ? relationship.canConnect : profileData.canConnect,
      isFollowing: typeof relationship.isFollowing === 'boolean' ? relationship.isFollowing : profileData.isFollowing,
      profileImageUrl: relationship.profileImageUrl || profileData.profileImageUrl,
    };
  } catch {
    return {
      ...profileData,
      linkedinUrl: temporaryMember.linkedinUrl,
      linkedinUsername: temporaryMember.linkedinUsername,
      profileUrn: temporaryMember.profileUrn || profileData.profileUrn,
      memberNumericId: temporaryMember.memberNumericId || profileData.memberNumericId || profileData.memberId,
    };
  }
}
