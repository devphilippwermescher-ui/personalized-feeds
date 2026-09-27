import { getAuthenticatedFeedsUser } from '../../auth/services/authenticated-user';
import { getFeedsAuthErrorResponse } from '../../feeds/errors/feeds-error';
import { getUserPlanSnapshot } from '../services/plan-service';

export function registerPlanMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'PLAN_GET') {
      return false;
    }

    getAuthenticatedFeedsUser()
      .then(async (user) => {
        if (!user) {
          sendResponse(getFeedsAuthErrorResponse({ plan: null, entitlements: null }));
          return;
        }

        const snapshot = await getUserPlanSnapshot(user.uid, { force: message.force === true });
        sendResponse({
          success: true,
          plan: snapshot.plan,
          entitlements: snapshot.entitlements,
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          plan: null,
          entitlements: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });
}
