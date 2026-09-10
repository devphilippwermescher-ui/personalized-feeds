export { showToast } from '../shared/toast';
export { escapeHtml } from '../shared/escape-html';

export function sendMessageToBackground(message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}
