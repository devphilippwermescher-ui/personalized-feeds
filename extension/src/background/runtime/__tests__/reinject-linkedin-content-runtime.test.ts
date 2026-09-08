import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  refreshLinkedInContentRuntime,
  reinjectLinkedInContentRuntimeIntoOpenTabs,
} from '../reinject-linkedin-content-runtime';

const query = vi.fn();
const executeScript = vi.fn();
const sendMessage = vi.fn();

describe('LinkedIn content runtime reinjection', () => {
  beforeEach(() => {
    query.mockReset();
    executeScript.mockReset();
    sendMessage.mockReset();
    vi.stubGlobal('chrome', {
      tabs: { query, sendMessage },
      scripting: { executeScript },
    });
  });

  it('restores the content runtime in every existing LinkedIn tab', async () => {
    query.mockResolvedValue([{ id: 11 }, { id: 22 }, { id: undefined }]);
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    executeScript.mockResolvedValue([]);

    await reinjectLinkedInContentRuntimeIntoOpenTabs();

    expect(query).toHaveBeenCalledWith({ url: 'https://www.linkedin.com/*' });
    expect(executeScript).toHaveBeenCalledTimes(4);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 11 },
      files: ['content.js'],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 22 },
      files: ['content.js'],
    });
  });

  it('keeps restoring other tabs when one injection is unavailable', async () => {
    query.mockResolvedValue([{ id: 11 }, { id: 22 }]);
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    executeScript.mockRejectedValueOnce(new Error('tab is loading')).mockResolvedValueOnce([]);

    await expect(reinjectLinkedInContentRuntimeIntoOpenTabs()).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not inject another runtime when its direct refresh succeeds', async () => {
    query.mockResolvedValue([{ id: 11 }]);
    sendMessage.mockResolvedValue({ ready: true });

    await reinjectLinkedInContentRuntimeIntoOpenTabs();

    expect(sendMessage).toHaveBeenCalledWith(11, {
      type: 'MYFEEDPILOT_CONTENT_RUNTIME_REFRESH',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('restores one LinkedIn tab when a navigation event finds no runtime', async () => {
    sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
    executeScript.mockResolvedValue([]);

    await refreshLinkedInContentRuntime(44);

    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 44 },
      func: expect.any(Function),
      args: ['__myFeedPilotContentRuntimeReplacementRequested__'],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 44 },
      files: ['content.js'],
    });
  });

  it('coalesces concurrent restore triggers for the same tab', async () => {
    let resolveRefresh!: (value: { ready: true }) => void;
    sendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const firstRefresh = refreshLinkedInContentRuntime(55);
    const secondRefresh = refreshLinkedInContentRuntime(55);
    resolveRefresh({ ready: true });
    await Promise.all([firstRefresh, secondRefresh]);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(executeScript).not.toHaveBeenCalled();
  });
});
