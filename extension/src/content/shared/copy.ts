export const CONTENT_COPY = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    viewSharedFeeds: 'View shared feeds',
    openDashboard: 'Open Dashboard',
    manageAccount: 'Manage account',
    profileSettings: 'Profile settings',
    subscription: 'Subscription',
    signOut: 'Sign Out',
    features: 'Features',
    signingIn: 'Signing in...',
    loadingFeeds: 'Loading feeds...',
    loadingProfiles: 'Loading profiles...',
    adding: 'Adding...',
    search: 'Search',
  },
  sidebar: {
    myFeeds: 'My Feeds',
    sharedWithMe: 'Shared with me',
    searchFeedsPlaceholder: 'Search feeds...',
    searchSharedFeedsPlaceholder: 'Search shared feeds...',
    noFeedsTitle: 'No feeds yet',
    noFeedsHint: 'Create your first feed to start organizing LinkedIn profiles',
    noSharedFeedsTitle: 'Nothing shared with you yet',
    noSharedFeedsHint: 'Shared feeds you follow will appear here.',
    noMatchingFeedsTitle: 'No matching feeds',
    noMatchingFeedsHint: 'Try a different search query or clear the filter.',
    signInTitle: 'Sign in to continue',
    signInDescription: 'Access your curated feeds and manage your contacts.',
    signInButton: 'Sign in with Google',
    signInHint: 'This signs in the extension directly. Logging in on the dashboard website does not automatically sign in this panel.',
    premiumTitle: 'Personalized Feeds',
    premiumDescription:
      'Unlock custom feeds with a paid subscription and manage everything from your myFeedPilot dashboard.',
    premiumHint: 'View subscription plans',
  },
  profile: {
    addToFeedTitle: 'Add to Feed',
    addToFeedLoading: 'Loading...',
    addToFeedSubmitting: 'Adding...',
    createFeedTitle: 'Create New Feed',
    createFeedAction: '+ Create new feed',
    createFeedSubmit: 'Create & Add Profile',
    creatingFeedSubmit: 'Creating...',
    authTitle: 'Sign in to use Feeds',
    authDescription: 'Sign in with your Google account to create and manage personalized feeds.',
    authButton: 'Sign in with Google',
    loadingFeeds: 'Loading feeds...',
    createFeedNamePlaceholder: 'Feed name (e.g. Prospects, Industry Leaders...)',
    createFeedDescriptionPlaceholder: 'Description (optional)',
    addToFeedCountSuffix: 'members',
    addToFeedSaveHint: 'Choose a feed to save this profile.',
    noFeedsTitle: 'No feeds yet.',
    noFeedsHint: 'Create your first feed to start organizing LinkedIn profiles.',
    failedToAddToFeed: 'Failed to add to feed',
    failedToAdd: 'Failed to add',
  },
  postButtons: {
    addToFeedTitle: 'Add to Feed',
    chooseFeedHint: 'Choose a feed to save this author.',
    noFeedsTitle: 'No feeds yet.',
    noFeedsHint: 'Create your first feed in the sidebar, then try again.',
    loadingFeeds: 'Loading feeds...',
    buttonAria: 'Add User to a feed',
    drawerLabel: 'Add to feed',
    authorAddSubtitle: (name: string) => `<strong>${name}</strong> can be added to one of your feeds.`,
    signInRequired: 'Sign in to use feeds in the sidebar first.',
    failedToAddToFeed: 'Failed to add to feed',
    failedToOpenFeeds: 'Failed to open feeds',
    membersSuffix: 'members',
  },
  feedModals: {
    editFeedTitle: 'Edit feed',
    feedNameLabel: 'Feed Name',
    feedNamePlaceholder: 'Enter feed name',
    saveChangesAction: 'Save Changes',
    deleteFeedTitle: 'Delete feed',
    deleteFeedAction: 'Delete Feed',
    deletingFeedAction: 'Deleting...',
    addPeopleTitle: (feedName: string) => `Add People to "${feedName}"`,
    addPeopleSearchPlaceholder: 'Search LinkedIn profiles...',
    addPeopleIdleTitle: 'Search for people on LinkedIn',
    addPeopleIdleHint: 'Enter a name or keywords to find people',
    addPeopleMinCharsHint: 'Enter at least 2 characters.',
    addPeopleSearching: 'Searching LinkedIn...',
    addPeopleUnavailableTitle: 'Search unavailable',
    addPeopleNoResultsTitle: 'No people found',
    addPeopleNoResultsHint: 'Try another query.',
    addPeopleSelectedCount: (count: number) => `${count} selected`,
    addPeopleAction: (count: number) => `Add ${count} Person${count === 1 ? '' : 's'}`,
    emptyProfilesHint: 'No profiles have been added to this feed yet.',
    sharedWithTitle: 'Shared with',
    sharedLoadingTitle: 'Loading shared access...',
    sharedLoadingHint: 'Checking who already has access to this feed.',
    sharedEmptyTitle: 'No one has access to this feed yet',
    sharedEmptyHint: 'Add people by entering their email above',
    sharedRemoveAction: 'Remove',
    sharedRemovingAction: 'Removing...',
    followedTitle: `You're now following this feed!`,
    followedHint: 'You can find this feed in your "Shared with me" section.',
    duplicateTitle: 'Duplicate this feed?',
  },
};

export function getSidebarEmptyCopy(
  activeFeedTab: 'owned' | 'shared',
  hasAnyFeeds: boolean
): { title: string; hint: string } {
  if (hasAnyFeeds) {
    return {
      title: CONTENT_COPY.sidebar.noMatchingFeedsTitle,
      hint: CONTENT_COPY.sidebar.noMatchingFeedsHint,
    };
  }

  if (activeFeedTab === 'shared') {
    return {
      title: CONTENT_COPY.sidebar.noSharedFeedsTitle,
      hint: CONTENT_COPY.sidebar.noSharedFeedsHint,
    };
  }

  return {
    title: CONTENT_COPY.sidebar.noFeedsTitle,
    hint: CONTENT_COPY.sidebar.noFeedsHint,
  };
}

export function getDeleteFeedDescription(feedName: string, memberCount: number): { title: string; description: string } {
  return {
    title: `Delete "${feedName}"?`,
    description: `This will remove the feed and ${memberCount === 1 ? '1 profile' : `${memberCount} profiles`} inside "${feedName}".`,
  };
}

export function getMemberCountLabel(count: number): string {
  return `${count} member${count === 1 ? '' : 's'}`;
}
