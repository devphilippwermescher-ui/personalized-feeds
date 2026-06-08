declare let __webpack_public_path__: string;

if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
  __webpack_public_path__ = chrome.runtime.getURL('');
}
