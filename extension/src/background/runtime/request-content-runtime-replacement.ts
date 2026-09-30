/**
 * Runs through chrome.scripting.executeScript in the extension's isolated
 * world. Imported runtime values are unavailable after Chrome serializes this
 * function, so the marker is passed explicitly.
 */
export function requestContentRuntimeReplacement(marker: string): void {
  (window as unknown as Record<string, unknown>)[marker] = true;
}
