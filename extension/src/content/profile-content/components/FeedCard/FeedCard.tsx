import type { ProfileData } from '../../types';

export function FeedCard({ profile }: { profile: ProfileData }) {
  let logoUrl = '';
  try {
    logoUrl = chrome.runtime.getURL('icons/icon48.png');
  } catch {
    logoUrl = '';
  }

  return (
    <div className="pf-feed-card-inner">
      <div className="pf-feed-card-left">
        <div className="pf-feed-icon-wrapper">
          <div className="pf-feed-icon-box">
            {logoUrl ? <img src={logoUrl} alt="myFeedPilot" className="pf-feed-card-logo" /> : null}
          </div>
          <div className="pf-feed-status-badge" id="pf-feed-status-badge">
            <span id="pf-feed-status-icon"></span>
          </div>
        </div>
        <div className="pf-feed-info">
          <div className="pf-feed-info-text" id="pf-feed-info-text">
            <strong>{profile.displayName}</strong> is not in any feed
          </div>
          <div className="pf-feed-memberships" id="pf-feed-memberships"></div>
        </div>
      </div>
      <div className="pf-feed-card-right">
        <button className="pf-add-to-feed-button" id="pf-add-to-feed-btn">
          Add to feed
        </button>
      </div>
    </div>
  );
}
