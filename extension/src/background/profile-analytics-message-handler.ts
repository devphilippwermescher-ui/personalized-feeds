import {
  queueProfileAnalyticsForLinkedInActivity,
  queueProfileAnalyticsSync,
} from './profile-analytics-sync-coordinator';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROFILE_ANALYTICS_CONNECTION_HISTORY_REPAIR_NOW') {
    const trigger = message.mode === 'restart' ? 'history_repair' : 'history_resume';
    void queueProfileAnalyticsSync(trigger, sender.tab?.id)
      .then((result) => sendResponse({ success: result.success, result }))
      .catch((error) =>
        sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) })
      );
    return true;
  }

  if (message.type === 'PROFILE_ANALYTICS_PROFILE_METADATA_CHANGED') {
    if (!sender.tab?.url?.startsWith('https://www.linkedin.com/') || typeof sender.tab.id !== 'number') {
      sendResponse({ success: false, error: 'Profile metadata events are accepted only from LinkedIn tabs.' });
      return false;
    }
    console.info('[profile-analytics] profile metadata change detected', {
      mutation: message.mutation,
      sourceUrl: message.sourceUrl,
      linkedInTabId: sender.tab.id,
    });
    void queueProfileAnalyticsSync('profile_metadata_changed', sender.tab.id).catch((error) => {
      console.warn('[profile-analytics] profile metadata sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    sendResponse({ success: true, queued: true });
    return false;
  }

  if (message.type !== 'PROFILE_ANALYTICS_LINKEDIN_ACTIVITY') return false;

  void queueProfileAnalyticsForLinkedInActivity(sender.tab?.id).catch((error) => {
    console.warn('[profile-analytics] LinkedIn activity sync failed', error);
  });
  sendResponse({ success: true, queued: true });
  return false;
});
