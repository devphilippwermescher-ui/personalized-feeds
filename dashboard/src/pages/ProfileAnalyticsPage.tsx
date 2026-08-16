import {
  HiOutlineEye,
  HiOutlineHeart,
  HiOutlineMagnifyingGlass,
  HiOutlinePercentBadge,
  HiOutlineTrophy,
  HiOutlineUserGroup,
} from 'react-icons/hi2';
import { MetricTrendChart } from '../components/MetricTrendChart';
import { AnalyticsDateRangeControl } from '../features/profile-analytics/components/AnalyticsDateRangeControl';
import { ConnectionsFollowersChart } from '../features/profile-analytics/components/ConnectionsFollowersChart';
import { MetricCard } from '../features/profile-analytics/components/MetricCard';
import { ProfileAnalyticsHistoryProgress } from '../features/profile-analytics/components/ProfileAnalyticsHistoryProgress';
import { ProfileAnalyticsHero } from '../features/profile-analytics/components/ProfileAnalyticsHero';
import {
  ProfileAnalyticsDataSkeleton,
  ProfileAnalyticsSkeleton,
} from '../features/profile-analytics/components/ProfileAnalyticsSkeleton';
import { ProfileAnalyticsSyncNotice } from '../features/profile-analytics/components/ProfileAnalyticsSyncNotice';
import { useAnalyticsDateRange } from '../features/profile-analytics/hooks/useAnalyticsDateRange';
import { useProfileAnalyticsViewModel } from '../features/profile-analytics/hooks/useProfileAnalyticsViewModel';
import { formatNumber, formatPercent } from '../utils/format';

interface ProfileAnalyticsPageProps {
  userId: string;
}

export default function ProfileAnalyticsPage({ userId }: ProfileAnalyticsPageProps) {
  const dateRange = useAnalyticsDateRange();
  const analytics = useProfileAnalyticsViewModel(userId, dateRange.selectedDateRange);

  if (analytics.loading) return <ProfileAnalyticsSkeleton />;
  const routineSyncRunning = analytics.syncStatus?.status === 'syncing' && !analytics.connectionHistoryLoading;
  const historyUnavailable = analytics.connectionHistoryLoading || analytics.connectionHistoryNeedsRepair;
  // A routine refresh hides stale cards until Firestore has been reread. The
  // one-time Connections bootstrap is different: current totals stay visible,
  // while all range controls and charts wait for the history import.
  const showDataSkeleton = !analytics.snapshot || routineSyncRunning;

  return (
    <div className="profile-analytics-page">
      <ProfileAnalyticsHero profile={analytics.profile} />

      <div className="page-header profile-analytics-heading">
        <div>
          <h1>Profile Analytics</h1>
          <p className="page-subtitle">Your LinkedIn profile at a glance</p>
        </div>
        <AnalyticsDateRangeControl
          range={dateRange.range}
          customRange={dateRange.customRange}
          isCustomPickerOpen={dateRange.isCustomPickerOpen}
          activeBoundary={dateRange.activeCustomBoundary}
          visibleMonth={dateRange.visibleMonth}
          disabled={historyUnavailable}
          onPresetSelect={dateRange.selectPreset}
          onCustomToggle={dateRange.toggleCustomPicker}
          onCustomClose={dateRange.closeCustomPicker}
          onVisibleMonthChange={dateRange.setVisibleMonth}
          onActiveBoundaryChange={dateRange.setActiveCustomBoundary}
          onCustomRangeChange={dateRange.updateCustomRange}
          onReset={dateRange.reset}
        />
      </div>

      {analytics.connectionHistoryLoading && analytics.syncStatus?.status === 'syncing' ? null : (
        <ProfileAnalyticsSyncNotice status={analytics.syncStatus} extensionError={analytics.syncStatusError} />
      )}

      {analytics.connectionHistoryLoading ? (
        <ProfileAnalyticsHistoryProgress bootstrap={analytics.connectionHistoryBootstrap} />
      ) : null}

      {analytics.connectionHistoryNeedsRepair ? (
        <div className="profile-analytics-sync-notice profile-analytics-sync-notice--warning" role="status">
          Current Connections total is available, but the one-time history import needs to be resumed before date ranges
          can be shown.
        </div>
      ) : null}

      {analytics.error ? (
        <div className="profile-analytics-alert profile-analytics-alert--error">{analytics.error}</div>
      ) : null}

      {showDataSkeleton ? (
        <ProfileAnalyticsDataSkeleton />
      ) : (
        <>
          <div className="profile-analytics-metrics-grid">
            <MetricCard
              icon={<HiOutlineUserGroup />}
              value={formatNumber(analytics.connectionsInRange)}
              label="Connections"
              rangeLabel={dateRange.rangeLabel}
              tone="blue"
            />
            <MetricCard
              icon={<HiOutlineHeart />}
              value={formatNumber(analytics.followersInRange)}
              label="Followers"
              rangeLabel={dateRange.rangeLabel}
              tone="cyan"
            />
            <MetricCard
              icon={<HiOutlinePercentBadge />}
              value={analytics.acceptanceRate.sentCount ? formatPercent(analytics.acceptanceRate.rate) : '-'}
              label="Acceptance Rate"
              rangeLabel={dateRange.rangeLabel}
              tone="mint"
              loading={!analytics.supportingDataLoaded}
              tooltip={
                analytics.acceptanceRate.sentCount
                  ? `${analytics.acceptanceRate.acceptedCount} of ${analytics.acceptanceRate.sentCount} tracked invites accepted. Only invites sent while the extension is active count.`
                  : 'Accepted invites divided by invites sent while the extension is active.'
              }
            />
            <MetricCard
              icon={<HiOutlineEye />}
              value={`${formatNumber(analytics.profileViewsVisibleInRange)} / ${formatNumber(
                analytics.profileViewsHiddenInRange
              )}`}
              label="Profile Visitors"
              rangeLabel={dateRange.rangeLabel}
              tone="sky"
              loading={!analytics.supportingDataLoaded}
            />
            <MetricCard
              icon={<HiOutlineMagnifyingGlass />}
              value={formatNumber(analytics.searchAppearancesInRange)}
              label="Search Appearances"
              rangeLabel={dateRange.rangeLabel}
              tone="violet"
            />
            <MetricCard
              icon={<HiOutlineTrophy />}
              value={
                typeof analytics.socialSellingIndexInRange === 'number'
                  ? `${analytics.socialSellingIndexInRange}/100`
                  : '-'
              }
              label="Social Selling Index (SSI)"
              rangeLabel={dateRange.rangeLabel}
              tone="amber"
            />
          </div>

          {historyUnavailable ? null : (
            <div className="profile-analytics-chart-grid">
              <ConnectionsFollowersChart
                points={analytics.connectionsFollowersPoints}
                rangeLabel={dateRange.rangeLabel}
                connectionsAddedEstimated={
                  analytics.profile?.connectionHistoryKind === 'backfilled_current_connections'
                }
              />
              <MetricTrendChart
                title="Acceptance Rate"
                summary={
                  analytics.acceptanceRate.sentCount
                    ? `${analytics.acceptanceRate.acceptedCount} accepted · ${analytics.acceptanceRate.sentCount} sent`
                    : 'No tracked invitations'
                }
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlinePercentBadge />}
                points={analytics.acceptanceRatePoints}
                color="#10A88A"
                gradientId="acceptanceRateAreaGradient"
                minimumMax={100}
                valueFormatter={formatPercent}
                emptyLabel="No invitation trend yet"
              />
              <MetricTrendChart
                title="Profile Visitors"
                summary={`${formatNumber(analytics.profileViewsVisibleInRange)} visible · ${formatNumber(
                  analytics.profileViewsHiddenInRange
                )} hidden`}
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlineEye />}
                points={analytics.profileViewsPoints}
                color="#0A66C2"
                gradientId="profileViewsAreaGradient"
                emptyLabel="No profile visitors in this period"
              />
              <MetricTrendChart
                title="Search Appearances"
                summary={`${formatNumber(analytics.searchAppearancesInRange)} ${
                  analytics.isTotalRange ? 'total' : 'latest in range'
                }`}
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlineMagnifyingGlass />}
                points={analytics.searchAppearancesPoints}
                color="#8B5CF6"
                gradientId="searchAppearancesAreaGradient"
                emptyLabel="No search appearance trend yet"
              />
              <MetricTrendChart
                title="Social Selling Index (SSI)"
                summary={`(${
                  typeof analytics.socialSellingIndexInRange === 'number'
                    ? `${analytics.socialSellingIndexInRange}/100`
                    : '-'
                } ${analytics.isTotalRange ? 'total' : 'latest in range'})`}
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlineTrophy />}
                points={analytics.socialSellingIndexPoints}
                color="#E89A00"
                gradientId="socialSellingIndexAreaGradient"
                minimumMax={100}
                valueFormatter={(value) => (typeof value === 'number' ? `${value}/100` : '-')}
                emptyLabel="No SSI trend yet"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
