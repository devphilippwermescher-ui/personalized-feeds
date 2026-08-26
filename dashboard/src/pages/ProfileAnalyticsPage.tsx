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
import { ConnectionHistoryResumeNotice } from '../features/profile-analytics/components/ConnectionHistoryResumeNotice';
import { MetricCard } from '../features/profile-analytics/components/MetricCard';
import { LinkedInConnectionPrompt } from '../features/profile-analytics/components/LinkedInConnectionPrompt';
import { ProfileAnalyticsHistoryProgress } from '../features/profile-analytics/components/ProfileAnalyticsHistoryProgress';
import { ProfileAnalyticsDevTools } from '../features/profile-analytics/components/ProfileAnalyticsDevTools';
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

function formatProfileCount(value: number | undefined): string {
  return `${formatNumber(value)} ${value === 1 ? 'profile' : 'profiles'}`;
}

const ACCEPTANCE_RATE_TOOLTIP =
  'Acceptance Rate is accepted invitations divided by invitations sent while myFeedPilot is tracking. Keep the extension active while sending invitations; only tracked invitations are included.';
const SEARCH_APPEARANCES_TOOLTIP =
  'Search Appearances is how often your profile appeared in LinkedIn search. myFeedPilot saves LinkedIn\'s latest reported value about once every 24 hours while a signed-in LinkedIn tab is available. A selected range shows the latest saved value in that range.';
const SOCIAL_SELLING_INDEX_TOOLTIP =
  'SSI is LinkedIn\'s 0–100 Social Selling Index. myFeedPilot saves LinkedIn\'s current score about once every 24 hours while a signed-in LinkedIn tab is available. A selected range shows the latest saved score in that range.';

function getPositiveProfileCount(value: number | undefined): number {
  return typeof value === 'number' && value > 0 ? value : 0;
}

function formatProfileVisitorsValue(visible: number | undefined, hidden: number | undefined): string {
  const visibleCount = getPositiveProfileCount(visible);
  const hiddenCount = getPositiveProfileCount(hidden);
  if (visibleCount && hiddenCount) return `${formatNumber(visibleCount)} / ${formatNumber(hiddenCount)}`;
  if (visibleCount) return formatNumber(visibleCount);
  if (hiddenCount) return formatNumber(hiddenCount);
  return '-';
}

function getProfileVisitorsTooltip(visible: number | undefined, hidden: number | undefined): string {
  const visibleCount = getPositiveProfileCount(visible);
  const hiddenCount = getPositiveProfileCount(hidden);
  const explanations: string[] = [];
  if (visibleCount) {
    explanations.push(`${formatProfileCount(visibleCount)}: visible visitor profiles saved by myFeedPilot.`);
  }
  if (hiddenCount) {
    explanations.push(
      `${formatProfileCount(hiddenCount)}: private-mode and recruiter views reported by LinkedIn in the last 90 days.`
    );
  }
  return (
    explanations.join(' ') ||
    'Profile Visitors appear after myFeedPilot collects visible visitors and LinkedIn reports private-mode or recruiter views.'
  );
}

function getProfileVisitorsSummary(visible: number | undefined, hidden: number | undefined): string {
  const visibleCount = getPositiveProfileCount(visible);
  const hiddenCount = getPositiveProfileCount(hidden);
  const parts: string[] = [];
  if (visibleCount) parts.push(`${formatNumber(visibleCount)} visible`);
  if (hiddenCount) parts.push(`${formatNumber(hiddenCount)} hidden`);
  return parts.join(' · ') || 'No saved visitor data';
}

function getSearchAppearancesSummary(value: number | undefined, isTotalRange: boolean): string {
  if (typeof value !== 'number') return 'No Search Appearances yet';
  return `${formatNumber(value)} ${isTotalRange ? 'total' : 'latest in range'}`;
}

function getSocialSellingIndexSummary(value: number | undefined, isTotalRange: boolean): string {
  if (typeof value !== 'number') return 'No SSI yet';
  return `(${value}/100 ${isTotalRange ? 'total' : 'latest in range'})`;
}

export default function ProfileAnalyticsPage({ userId }: ProfileAnalyticsPageProps) {
  const dateRange = useAnalyticsDateRange();
  const analytics = useProfileAnalyticsViewModel(userId, dateRange.selectedDateRange);

  if (analytics.loading) return <ProfileAnalyticsSkeleton />;
  const historyUnavailable = analytics.connectionHistoryLoading || analytics.connectionHistoryNeedsRepair;
  // Routine background syncs never hide cached values. Skeletons are reserved
  // for a true first load where neither IndexedDB nor Firestore has data yet.
  const showLinkedInConnectionPrompt = !analytics.snapshot && analytics.syncStatusLoaded;
  const showDataSkeleton = !showLinkedInConnectionPrompt && !analytics.snapshot;

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

      {import.meta.env.DEV ? <ProfileAnalyticsDevTools userId={userId} /> : null}

      {analytics.connectionHistoryLoading && analytics.syncStatus?.status === 'syncing' ? null : (
        <ProfileAnalyticsSyncNotice
          status={analytics.syncStatus}
          extensionError={analytics.syncStatusError}
          hasSearchAppearancesValue={typeof analytics.searchAppearances?.totalCount === 'number'}
        />
      )}

      {analytics.connectionHistoryLoading ? (
        <ProfileAnalyticsHistoryProgress bootstrap={analytics.connectionHistoryBootstrap} />
      ) : null}

      {analytics.connectionHistoryNeedsRepair ? <ConnectionHistoryResumeNotice /> : null}

      {analytics.error ? (
        <div className="profile-analytics-alert profile-analytics-alert--error">{analytics.error}</div>
      ) : null}

      {showLinkedInConnectionPrompt ? (
        <LinkedInConnectionPrompt />
      ) : showDataSkeleton ? (
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
                  : ACCEPTANCE_RATE_TOOLTIP
              }
            />
            <MetricCard
              icon={<HiOutlineEye />}
              value={formatProfileVisitorsValue(
                analytics.profileViewsVisibleInRange,
                analytics.profileViewsHiddenInRange
              )}
              label="Profile Visitors"
              rangeLabel={dateRange.rangeLabel}
              tone="sky"
              loading={!analytics.supportingDataLoaded}
              tooltip={getProfileVisitorsTooltip(
                analytics.profileViewsVisibleInRange,
                analytics.profileViewsHiddenInRange
              )}
              tooltipPlacement="right"
            />
            <MetricCard
              icon={<HiOutlineMagnifyingGlass />}
              value={formatNumber(analytics.searchAppearancesInRange)}
              label="Search Appearances"
              rangeLabel={dateRange.rangeLabel}
              tone="violet"
              tooltip={SEARCH_APPEARANCES_TOOLTIP}
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
              tooltip={SOCIAL_SELLING_INDEX_TOOLTIP}
            />
          </div>

          {historyUnavailable ? null : (
            <div className="profile-analytics-chart-grid">
              <ConnectionsFollowersChart
                points={analytics.connectionsFollowersPoints}
                rangeLabel={dateRange.rangeLabel}
                showYear={analytics.isTotalRange}
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
                showYear={analytics.isTotalRange}
                showEmptyPlot
                tooltip={ACCEPTANCE_RATE_TOOLTIP}
                tooltipPlacement="right"
                zoomToNonZeroData
              />
              <MetricTrendChart
                title="Profile Visitors"
                summary={getProfileVisitorsSummary(
                  analytics.profileViewsVisibleInRange,
                  analytics.profileViewsHiddenInRange
                )}
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlineEye />}
                points={analytics.profileViewsPoints}
                color="#0A66C2"
                gradientId="profileViewsAreaGradient"
                emptyLabel="No profile visitors in this period"
                showYear={analytics.isTotalRange}
                showEmptyPlot
                tooltip={getProfileVisitorsTooltip(
                  analytics.profileViewsVisibleInRange,
                  analytics.profileViewsHiddenInRange
                )}
                zoomToNonZeroData
              />
              <MetricTrendChart
                title="Search Appearances"
                summary={getSearchAppearancesSummary(
                  analytics.searchAppearancesInRange,
                  analytics.isTotalRange
                )}
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlineMagnifyingGlass />}
                points={analytics.searchAppearancesPoints}
                color="#8B5CF6"
                gradientId="searchAppearancesAreaGradient"
                emptyLabel="No search appearance trend yet"
                showYear={analytics.isTotalRange}
                showEmptyPlot
                tooltip={SEARCH_APPEARANCES_TOOLTIP}
                tooltipPlacement="right"
                zoomToNonZeroData
              />
              <MetricTrendChart
                title="Social Selling Index (SSI)"
                summary={getSocialSellingIndexSummary(
                  analytics.socialSellingIndexInRange,
                  analytics.isTotalRange
                )}
                rangeLabel={dateRange.rangeLabel}
                icon={<HiOutlineTrophy />}
                points={analytics.socialSellingIndexPoints}
                color="#E89A00"
                gradientId="socialSellingIndexAreaGradient"
                minimumMax={100}
                valueFormatter={(value) => (typeof value === 'number' ? `${value}/100` : '-')}
                emptyLabel="No SSI trend yet"
                showYear={analytics.isTotalRange}
                showEmptyPlot
                tooltip={SOCIAL_SELLING_INDEX_TOOLTIP}
                zoomToNonZeroData
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
