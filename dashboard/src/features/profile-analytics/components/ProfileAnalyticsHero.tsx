import { HiOutlineMapPin, HiOutlineUserGroup } from 'react-icons/hi2';
import type { ProfileAnalyticsProfileSnapshot } from 'shared/types';
import { formatNumber } from '../../../utils/format';

export function ProfileAnalyticsHero({ profile }: { profile?: ProfileAnalyticsProfileSnapshot }) {
  return (
    <section className="profile-analytics-hero">
      <div
        className="profile-analytics-cover"
        style={profile?.backgroundImageUrl ? { backgroundImage: `url(${profile.backgroundImageUrl})` } : undefined}
      />
      <div className="profile-analytics-profile">
        {profile?.profileImageUrl ? (
          <img src={profile.profileImageUrl} alt="" className="profile-analytics-avatar" />
        ) : (
          <div className="profile-analytics-avatar profile-analytics-avatar--fallback">
            {profile?.displayName?.charAt(0).toUpperCase() || 'P'}
          </div>
        )}
        <div className="profile-analytics-profile-copy">
          <h1>{profile?.displayName || 'Profile Analytics'}</h1>
          <p>{profile?.headline || 'Sync your LinkedIn profile to start collecting analytics.'}</p>
          <div className="profile-analytics-profile-meta">
            {profile?.location ? (
              <span>
                <HiOutlineMapPin />
                {profile.location}
              </span>
            ) : null}
            {typeof profile?.connectionsCount === 'number' ? (
              <span>
                <HiOutlineUserGroup />
                {formatNumber(profile.connectionsCount)} Connections
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
