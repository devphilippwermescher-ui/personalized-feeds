import { queueProfileAnalyticsForLinkedInActivity } from './profile-analytics-sync-coordinator';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'PROFILE_ANALYTICS_LINKEDIN_ACTIVITY') return false;

  void queueProfileAnalyticsForLinkedInActivity(sender.tab?.id).catch((error) => {
    console.warn('[profile-analytics] LinkedIn activity sync failed', error);
  });
  sendResponse({ success: true, queued: true });
  return false;
});
