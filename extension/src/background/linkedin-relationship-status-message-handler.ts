import { normalizeFeedsError } from './feeds-errors';
import {
  resolveLinkedInRelationshipStatusInBackground,
  sendLinkedInConnectRequestInBackground,
} from './linkedin-relationship-status-resolver';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'LINKEDIN_CONNECT_REQUEST_BACKGROUND') {
    sendLinkedInConnectRequestInBackground(
      String(message.profileUrn || ''),
      typeof message.referrerUrl === 'string' ? message.referrerUrl : undefined
    )
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to send LinkedIn connect request in background'),
        });
      });

    return true;
  }

  if (message.type === 'LINKEDIN_RELATIONSHIP_STATUS_RESOLVE_BACKGROUND') {
    resolveLinkedInRelationshipStatusInBackground(String(message.linkedinUsername || ''), {
      allowHtmlFallback: false,
    })
      .then((resolution) => {
        if (!resolution) {
          sendResponse({
            success: false,
            error: 'LinkedIn relationship status was not found in background GraphQL.',
          });
          return;
        }

        sendResponse({ success: true, resolution });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: normalizeFeedsError(error, 'Failed to resolve relationship status in background'),
        });
      });

    return true;
  }

  return false;
});
