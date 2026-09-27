import { registerAuthSettingsMessageHandler } from '../features/auth/messaging/settings-message-handler';
import { registerDashboardAnalyticsMessageHandler } from '../features/dashboard-analytics/dashboard-analytics-message-handler';
import { registerExternalMessageHandlers } from '../features/dashboard-bridge/messaging/message-handler';
import { registerFeedSharingMessageHandler } from '../features/feed-sharing/messaging/message-handler';
import { registerFeedsMessageHandler } from '../features/feeds/messaging/message-handler';
import { registerMessagingProfilePickerRelay } from '../features/messaging-buttons/messaging/message-handler';
import { registerProfileViewersMessageHandler } from '../features/profile-viewers/profile-viewers-message-handler';
import { registerLinkedInRelationshipStatusMessageHandler } from '../features/relationship-status/messaging/message-handler';
import { registerPlanMessageHandler } from '../features/plans/public';
import { registerProfileAnalyticsMessageHandler } from '../features/profile-analytics/profile-analytics-message-handler';
import { registerProfileAnalyticsPassiveCapture } from '../features/profile-analytics/profile-analytics-passive-capture';

export function registerBackgroundMessageHandlers(): void {
  registerExternalMessageHandlers();
  registerAuthSettingsMessageHandler();
  registerPlanMessageHandler();
  registerLinkedInRelationshipStatusMessageHandler();
  registerProfileViewersMessageHandler();
  registerProfileAnalyticsMessageHandler();
  registerDashboardAnalyticsMessageHandler();
  registerProfileAnalyticsPassiveCapture();
  registerFeedsMessageHandler();
  registerFeedSharingMessageHandler();
  registerMessagingProfilePickerRelay();
}
