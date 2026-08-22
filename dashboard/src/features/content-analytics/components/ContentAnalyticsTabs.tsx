import type { ContentAnalyticsTab } from '../types';

const TABS: Array<{ key: ContentAnalyticsTab; label: string }> = [
  { key: 'content', label: 'Content' },
  { key: 'insights', label: 'Insights' },
];

interface ContentAnalyticsTabsProps {
  activeTab: ContentAnalyticsTab;
  onSelect: (tab: ContentAnalyticsTab) => void;
}

export function ContentAnalyticsTabs({ activeTab, onSelect }: ContentAnalyticsTabsProps) {
  return (
    <div className="content-analytics-tabs" role="tablist" aria-label="Content Analytics sections">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`content-analytics-tab-${tab.key}`}
          aria-selected={tab.key === activeTab}
          aria-controls={`content-analytics-panel-${tab.key}`}
          className={`content-analytics-tab${tab.key === activeTab ? ' is-active' : ''}`}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
