import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CONTENT_ANALYTICS_ENABLED, DASHBOARD_ENABLED } from 'shared/feature-flags';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FeedDetailPage from './pages/FeedDetailPage';
import BlankDashboardPage from './pages/BlankDashboardPage';
import DashboardDisabledPage from './pages/DashboardDisabledPage';
import ProfileAnalyticsPage from './pages/ProfileAnalyticsPage';
import ContentAnalyticsPage from './pages/ContentAnalyticsPage';
import Sidebar from './components/Sidebar';

function EnabledDashboardApp() {
  const {
    user,
    loading,
    authError,
    signInWithGoogle,
    signInWithExtension,
    logout,
    extensionAuthAvailable,
    extensionAuthLoading,
  } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="loading-screen">
        <p className="auth-error-text">{authError}</p>
        <p style={{ fontSize: 14, marginTop: 8 }}>Try signing in below.</p>
        <LoginPage
          onSignIn={signInWithGoogle}
          onExtensionSignIn={signInWithExtension}
          extensionAuthAvailable={extensionAuthAvailable}
          extensionAuthLoading={extensionAuthLoading}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onSignIn={signInWithGoogle}
        onExtensionSignIn={signInWithExtension}
        extensionAuthAvailable={extensionAuthAvailable}
        extensionAuthLoading={extensionAuthLoading}
      />
    );
  }

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar user={user} onLogout={logout} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage userId={user.uid} />} />
            <Route path="/feed/:feedId" element={<FeedDetailPage userId={user.uid} />} />
            <Route path="/analytics/profile" element={<ProfileAnalyticsPage userId={user.uid} />} />
            <Route
              path="/analytics/content"
              element={
                CONTENT_ANALYTICS_ENABLED ? (
                  <ContentAnalyticsPage userId={user.uid} />
                ) : (
                  <BlankDashboardPage title="Content Analytics" />
                )
              }
            />
            <Route path="/analytics/comments" element={<BlankDashboardPage title="Comment Analytics" />} />
            <Route path="/settings/profile" element={<BlankDashboardPage title="Manage account" />} />
            <Route path="/settings/api-extension" element={<BlankDashboardPage title="API & Extension" />} />
            <Route path="/subscription" element={<BlankDashboardPage title="Subscription" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function App() {
  if (!DASHBOARD_ENABLED) {
    return <DashboardDisabledPage />;
  }

  return <EnabledDashboardApp />;
}

export default App;
