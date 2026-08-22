import {
  HiOutlineArrowPathRoundedSquare,
  HiOutlineChartBar,
  HiOutlineChatBubbleOvalLeft,
  HiOutlineDocumentText,
  HiOutlineHeart,
  HiOutlinePercentBadge,
} from 'react-icons/hi2';
import type { ContentAnalyticsMetric } from 'shared/types';
import type { ContentMetricCardModel } from '../types';
import { ContentMetricCard } from './ContentMetricCard';

const METRIC_ICONS: Record<ContentAnalyticsMetric, React.ReactNode> = {
  posts: <HiOutlineDocumentText />,
  impressions: <HiOutlineChartBar />,
  engagementRate: <HiOutlinePercentBadge />,
  reactions: <HiOutlineHeart />,
  comments: <HiOutlineChatBubbleOvalLeft />,
  reposts: <HiOutlineArrowPathRoundedSquare />,
};

interface ContentMetricCardsProps {
  cards: ContentMetricCardModel[];
  rangeLabel: string;
  selectedMetric: ContentAnalyticsMetric;
  loading?: boolean;
  onSelect: (metric: ContentAnalyticsMetric) => void;
}

export function ContentMetricCards({
  cards,
  rangeLabel,
  selectedMetric,
  loading,
  onSelect,
}: ContentMetricCardsProps) {
  return (
    <div className="content-analytics-metrics-grid">
      {cards.map((card) => (
        <ContentMetricCard
          key={card.key}
          card={card}
          icon={METRIC_ICONS[card.key]}
          rangeLabel={rangeLabel}
          isSelected={card.key === selectedMetric}
          loading={loading}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
