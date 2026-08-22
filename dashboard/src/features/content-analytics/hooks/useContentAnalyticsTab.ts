import { useCallback, useEffect, useState } from 'react';
import { CONTENT_ANALYTICS_TAB_QUERY_PARAM } from '../constants';
import type { ContentAnalyticsTab } from '../types';

function readTabFromLocation(): ContentAnalyticsTab {
  if (typeof window === 'undefined') return 'content';
  const value = new URLSearchParams(window.location.search).get(CONTENT_ANALYTICS_TAB_QUERY_PARAM);
  return value === 'insights' ? 'insights' : 'content';
}

/**
 * Content/Insights tab state, mirrored into the URL query so a shared link
 * reopens the same tab. Switching tabs performs no data work at all.
 */
export function useContentAnalyticsTab() {
  const [tab, setTab] = useState<ContentAnalyticsTab>(readTabFromLocation);

  useEffect(() => {
    const handlePopState = () => setTab(readTabFromLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const selectTab = useCallback((nextTab: ContentAnalyticsTab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    if (nextTab === 'content') url.searchParams.delete(CONTENT_ANALYTICS_TAB_QUERY_PARAM);
    else url.searchParams.set(CONTENT_ANALYTICS_TAB_QUERY_PARAM, nextTab);
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);

  return { tab, selectTab };
}
