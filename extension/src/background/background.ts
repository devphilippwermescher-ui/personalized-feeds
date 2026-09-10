import { DASHBOARD_ANALYTICS_SYNC_ENABLED } from 'shared/feature-flags';
import { initNativeInviteNetworkObserver } from './features/connection-invites/services/native-network-observer';
import { registerBackgroundAlarmHandlers } from './runtime/register-alarms';
import { registerBackgroundMessageHandlers } from './runtime/register-message-handlers';
import { registerBackgroundTabListeners } from './runtime/register-tab-listeners';
import { registerExtensionLifecycle } from './runtime/register-extension-lifecycle';
import { registerLinkedInContentRuntimeRestoration } from './runtime/register-linkedin-content-runtime';
import { startBackgroundRuntime } from './runtime/start-background-runtime';

if (DASHBOARD_ANALYTICS_SYNC_ENABLED) initNativeInviteNetworkObserver();
registerLinkedInContentRuntimeRestoration();
registerBackgroundMessageHandlers();
registerExtensionLifecycle();
registerBackgroundAlarmHandlers();
registerBackgroundTabListeners();
startBackgroundRuntime();
