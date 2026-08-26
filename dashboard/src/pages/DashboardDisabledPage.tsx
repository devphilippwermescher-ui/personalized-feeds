/**
 * Static release gate for the dormant dashboard.
 *
 * This component deliberately performs no authentication, extension
 * messaging, Firestore reads, or analytics work. The full dashboard remains
 * compiled and can be restored through the shared feature flag.
 */
export default function DashboardDisabledPage() {
  return (
    <main className="dashboard-disabled-page">
      <div className="dashboard-disabled-card">
        <h1>myFeedPilot</h1>
        <p>The dashboard is temporarily unavailable.</p>
      </div>
    </main>
  );
}
