import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  refreshLinkedInContentRuntime,
  reinjectLinkedInContentRuntimeIntoOpenTabs,
} from '../reinject-linkedin-content-runtime';

const query = vi.fn();
const executeScript = vi.fn();

describe('LinkedIn content runtime reinjection', () => {
  beforeEach(() => {
    query.mockReset();
    executeScript.mockReset();
    vi.stubGlobal('chrome', {
      tabs: { query },
      scripting: { executeScript },
    });
  });

  it('restores the content runtime in every existing LinkedIn tab', async () => {
    query.mockResolvedValue([{ id: 11 }, { id: 22 }, { id: undefined }]);
    executeScript.mockResolvedValue([]);

    await reinjectLinkedInContentRuntimeIntoOpenTabs();

    expect(query).toHaveBeenCalledWith({ url: 'https://www.linkedin.com/*' });
    expect(executeScript).toHaveBeenCalledTimes(6);
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
    executeScript.mockRejectedValueOnce(new Error('tab is loading')).mockResolvedValueOnce([]);

    await expect(reinjectLinkedInContentRuntimeIntoOpenTabs()).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledTimes(6);
  });

  it('does not inject another runtime when its direct refresh succeeds', async () => {
    query.mockResolvedValue([{ id: 11 }]);
    executeScript.mockResolvedValue([{ result: true }]);

    await reinjectLinkedInContentRuntimeIntoOpenTabs();

    expect(executeScript).toHaveBeenCalledOnce();
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 11 },
      func: expect.any(Function),
      args: ['__myFeedPilotContentRuntimeRegistration__'],
    });
  });

  it('restores one LinkedIn tab when a navigation event finds no runtime', async () => {
    executeScript.mockResolvedValue([]);

    await refreshLinkedInContentRuntime(44);

    expect(executeScript).toHaveBeenCalledTimes(3);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 44 },
      func: expect.any(Function),
      args: ['__myFeedPilotContentRuntimeRegistration__'],
    });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 44 },
      files: ['content.js'],
    });
  });

  it('coalesces concurrent restore triggers for the same tab', async () => {
    let resolveRefresh!: (value: Array<{ result: true }>) => void;
    executeScript.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const firstRefresh = refreshLinkedInContentRuntime(55);
    const secondRefresh = refreshLinkedInContentRuntime(55);
    resolveRefresh([{ result: true }]);
    await Promise.all([firstRefresh, secondRefresh]);

    expect(executeScript).toHaveBeenCalledTimes(1);
  });
});
