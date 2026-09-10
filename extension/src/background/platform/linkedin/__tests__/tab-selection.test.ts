import { describe, expect, it } from 'vitest';
import { selectLinkedInExecutionTabs } from '../tab-selection';

function tab(overrides: Partial<chrome.tabs.Tab> & { id: number }): chrome.tabs.Tab {
  const { id, ...rest } = overrides;
  return {
    id,
    index: 0,
    windowId: 1,
    pinned: false,
    highlighted: false,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    status: 'complete',
    url: 'https://www.linkedin.com/feed/',
    ...rest,
  };
}

describe('LinkedIn execution tab selection', () => {
  it('prefers the most recently accessed regular LinkedIn tab', () => {
    const result = selectLinkedInExecutionTabs([tab({ id: 1, lastAccessed: 100 }), tab({ id: 2, lastAccessed: 200 })]);
    expect(result.map((item) => item.id)).toEqual([2, 1]);
  });

  it('keeps an explicitly preferred healthy tab first', () => {
    const result = selectLinkedInExecutionTabs(
      [tab({ id: 1, lastAccessed: 300 }), tab({ id: 2, lastAccessed: 100 })],
      2
    );
    expect(result.map((item) => item.id)).toEqual([2, 1]);
  });

  it('keeps a preferred triggering tab while Chrome still reports it as loading', () => {
    const result = selectLinkedInExecutionTabs(
      [tab({ id: 1, status: 'complete' }), tab({ id: 2, status: 'loading', lastAccessed: 200 })],
      2
    );
    expect(result.map((item) => item.id)).toEqual([2, 1]);
  });

  it('drops discarded/loading tabs and deprioritizes the SSI page', () => {
    const result = selectLinkedInExecutionTabs([
      tab({ id: 1, discarded: true }),
      tab({ id: 2, status: 'loading' }),
      tab({ id: 3, url: 'https://www.linkedin.com/sales/ssi', lastAccessed: 300 }),
      tab({ id: 4, url: 'https://www.linkedin.com/feed/', lastAccessed: 100 }),
    ]);
    expect(result.map((item) => item.id)).toEqual([4, 3]);
  });
});
