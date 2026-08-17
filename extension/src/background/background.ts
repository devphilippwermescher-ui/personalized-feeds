import type { ProfileViewersSyncTrigger } from './profile-viewers-sync-state';
import { appendProfileViewersWakeEvent, PROFILE_VIEWERS_ALARM_NAME } from './profile-viewers-coordinator-storage';
import { queueProfileViewersFirstSurfaceSync } from './profile-viewers-coordinator';
import {
  PROFILE_VIEWERS_STATUS_ALARM_NAME,
  queueProfileViewersStatusSync,
  runProfileViewersStatusSync,
} from './profile-viewers-status-sync';
import { CONNECTION_INVITES_STATUS_ALARM_NAME } from './connection-invites-sync';
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
  // The sidebar is the first product surface a newly installed user sees.
  // Let Profile Viewers finish (or safely defer under its own budget) before
  // Profile Analytics is allowed to acquire the Connections-history lock.
  void queueProfileViewersFirstSurfaceSync(trigger).finally(() => {
    void queueProfileViewersStatusSync({ trigger, urgent: true });
    void queueProfileAnalyticsSync(trigger);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void appendProfileViewersWakeEvent({
    event: 'chrome_startup',
    trigger: 'chrome_startup',
  });
  void queueProfileViewersFirstSurfaceSync('chrome_startup').finally(() => {
    void queueProfileViewersStatusSync({ trigger: 'chrome_startup' });
    void queueProfileAnalyticsSync('chrome_startup');
  });
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === PROFILE_ANALYTICS_ALARM_NAME) {
    const receivedAt = Date.now();
    console.info('[profile-analytics] alarm fired', {
      alarmName: alarm.name,
      scheduledAt: alarm.scheduledTime,
      scheduledAtIso: new Date(alarm.scheduledTime).toISOString(),
      receivedAt,
      receivedAtIso: new Date(receivedAt).toISOString(),
      delayMs: Math.max(0, receivedAt - alarm.scheduledTime),
    });
    void queueProfileAnalyticsSync('alarm');
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
  void queueProfileViewersFirstSurfaceSync('alarm').finally(() => {
    // A postponed first-time analytics bootstrap may now continue after the
    // sidebar collector has completed its next safe batch.
    void queueProfileAnalyticsSync('alarm');
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetProfileAnalyticsLinkedInTab(tabId);
});

void appendProfileViewersWakeEvent({
  event: 'worker_loaded',
  trigger: 'service_worker',
});
// Acceptance Rate is now reconciled by the shared Profile Analytics alarm.
// Remove the legacy standalone invitation-status alarm after upgrading.
void chrome.alarms?.clear(CONNECTION_INVITES_STATUS_ALARM_NAME);
void chrome.alarms?.get(PROFILE_ANALYTICS_ALARM_NAME).then((alarm) => {
  console.info('[profile-analytics] alarm state on worker load', {
    alarmName: PROFILE_ANALYTICS_ALARM_NAME,
    exists: Boolean(alarm),
    scheduledAt: alarm?.scheduledTime,
    scheduledAtIso: alarm ? new Date(alarm.scheduledTime).toISOString() : undefined,
  });
});
void migrateToIndependentLinkedInSync()
  .then(() => queueProfileViewersFirstSurfaceSync('service_worker'))
  .finally(() => {
    void queueProfileViewersStatusSync({ trigger: 'service_worker' });
    void queueProfileAnalyticsSync('service_worker');
  });

import './external-message-handler';
import './auth-settings-message-handler';
import './linkedin-relationship-status-message-handler';
import './profile-viewers-message-handler';
import './profile-analytics-message-handler';
import './profile-analytics-passive-capture';
import './feeds-message-handler';
import './feed-sharing-message-handler';
