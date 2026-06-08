export function feedAddedMessage(profileName: string, feedName: string): string {
  return `${profileName} was added to "${feedName}"`;
}

export function multipleProfilesAddedMessage(count: number, feedName: string): string {
  return `${count} profile${count === 1 ? '' : 's'} were added to "${feedName}"`;
}

export function profileAlreadyInFeedMessage(profileName: string, feedName: string): string {
  return `${profileName} is already in "${feedName}"`;
}

export function profileRemovedFromFeedMessage(): string {
  return 'Profile was removed from the feed';
}

export function profileMovedToFeedMessage(): string {
  return 'Profile was moved to the selected feed';
}

export function profileUpdatedMessage(): string {
  return 'Profile details were updated';
}

export function feedUpdatedMessage(): string {
  return 'Feed details were updated';
}

export function feedDeletedMessage(feedName: string): string {
  return `"${feedName}" was deleted`;
}

export function feedSharedMessage(feedName: string): string {
  return `"${feedName}" was shared`;
}

export function feedCopiedMessage(feedName: string): string {
  return `"${feedName}" was copied to My Feeds`;
}

export function feedUnfollowedMessage(feedName: string): string {
  return `You unfollowed "${feedName}"`;
}

export function feedCreatedAndProfileAddedMessage(feedName: string): string {
  return `"${feedName}" was created and the profile was added`;
}

export function feedCreatedButProfileAddFailedMessage(feedName: string): string {
  return `"${feedName}" was created, but the profile could not be added`;
}

export function signedInMessage(): string {
  return 'Signed in successfully';
}

export function connectRequestSentMessage(): string {
  return 'Connect request was sent';
}
