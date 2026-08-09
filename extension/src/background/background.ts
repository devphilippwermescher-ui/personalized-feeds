import type { ProfileViewersSyncTrigger } from './profile-viewers-sync-state';
import { appendProfileViewersWakeEvent, PROFILE_VIEWERS_ALARM_NAME } from './profile-viewers-coordinator-storage';
import { queueProfileViewersSync } from './profile-viewers-coordinator';
import {
  PROFILE_VIEWERS_STATUS_ALARM_NAME,
  queueProfileViewersStatusSync,
  runProfileViewersStatusSync,
} from './profile-viewers-status-sync';
import {
  CONNECTION_INVITES_STATUS_ALARM_NAME,
  queueConnectionInvitesStatusSync,
  runConnectionInvitesStatusSync,
} from './connection-invites-sync';
import { initNativeInviteNetworkObserver } from './native-invite-network-observer';
import {
  forgetProfileAnalyticsLinkedInTab,
  PROFILE_ANALYTICS_ALARM_NAME,
  queueProfileAnalyticsSync,
} from './profile-analytics-sync-coordinator';
import { migrateToIndependentLinkedInSync } from './linkedin-sync-state-migration';

initNativeInviteNetworkObserver();

chrome.runtime.onInstalled.addListener((details) => {
  const trigger: ProfileViewersSyncTrigger = details.reason === 'install' ? 'install' : 'update';
  void appendProfileViewersWakeEvent({
    event: 'runtime_installed',
    trigger,
    reason: details.reason,
  });
  void queueProfileViewersSync(trigger);
  void queueProfileViewersStatusSync({ trigger, urgent: true });
  void queueConnectionInvitesStatusSync(trigger);
  void queueProfileAnalyticsSync(trigger);
});

chrome.runtime.onStartup.addListener(() => {
  void appendProfileViewersWakeEvent({
    event: 'chrome_startup',
    trigger: 'chrome_startup',
  });
  void queueProfileViewersSync('chrome_startup');
  void queueProfileViewersStatusSync({ trigger: 'chrome_startup' });
  void queueConnectionInvitesStatusSync('chrome_startup');
  void queueProfileAnalyticsSync('chrome_startup');
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === PROFILE_ANALYTICS_ALARM_NAME) {
    void queueProfileAnalyticsSync('alarm');
    return;
  }
  if (alarm.name === CONNECTION_INVITES_STATUS_ALARM_NAME) {
    void runConnectionInvitesStatusSync('alarm');
    return;
  }

  if (alarm.name === PROFILE_VIEWERS_STATUS_ALARM_NAME) {
    void runProfileViewersStatusSync('alarm');
    return;
  }

  if (alarm.name !== PROFILE_VIEWERS_ALARM_NAME) {
    return;
  }

  void appendProfileViewersWakeEvent({
    event: 'alarm_received',
    trigger: 'alarm',
    scheduledAt: alarm.scheduledTime,
  });
  void queueProfileViewersSync('alarm');
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetProfileAnalyticsLinkedInTab(tabId);
});

void appendProfileViewersWakeEvent({
  event: 'worker_loaded',
  trigger: 'service_worker',
});
void queueProfileViewersSync('service_worker');
void queueProfileViewersStatusSync({ trigger: 'service_worker' });
void queueConnectionInvitesStatusSync('service_worker');
void migrateToIndependentLinkedInSync().then(() => queueProfileAnalyticsSync('service_worker'));

import './external-message-handler';
import './auth-settings-message-handler';
import './linkedin-relationship-status-message-handler';
import './profile-viewers-message-handler';
import './profile-analytics-message-handler';
import './profile-analytics-passive-capture';
import './feeds-message-handler';
import './feed-sharing-message-handler';
