import type { UserInfo } from './types';
import { CONTENT_COPY, getSidebarEmptyCopy } from '../shared/copy';
import { DASHBOARD_ENABLED } from 'shared/feature-flags';
import type { UserFeatureSettings } from 'shared/types';
import { renderPlanOutlineStarIcon } from '../shared/plan-star';
import { escapeHtml } from '../shared/escape-html';

function renderSupportFooter(isPremium: boolean): string {
  return `
    ${
      isPremium
        ? ''
        : `
          <div class="lfa-pro-footer">
            <p class="lfa-pro-footer-copy">Pro removes limits across Profile Visitors, feeds &amp; more</p>
            <button class="lfa-pro-footer-btn" id="lfa-footer-get-pro-btn" type="button">
              ${renderPlanOutlineStarIcon()}
              <span>Get Pro</span>
            </button>
          </div>
        `
    }
    <div class="lfa-support-footer">
      <span class="lfa-support-label">Support &amp; Feedback :</span>
      <a class="lfa-support-link" href="mailto:dev.philipp.wermescher@gmail.com">dev.philipp.wermescher@gmail.com</a>
    </div>
  `;
}

function renderSettingsToggleRow(
  key: keyof UserFeatureSettings,
  label: string,
  enabled: boolean,
  tooltip: string
): string {
  return `
    <div class="lfa-settings-row" data-setting-help="${escapeHtml(tooltip)}">
      <span class="lfa-settings-row-label">${label}</span>
      <button
        class="lfa-settings-switch${enabled ? ' active' : ''}"
        type="button"
        data-setting-toggle="${escapeHtml(key)}"
        aria-pressed="${enabled ? 'true' : 'false'}"
      >
        <span class="lfa-settings-switch-thumb"></span>
      </button>
    </div>
  `;
}

export function renderSidebarHeader(params: {
  logoUrl: string;
  currentUser: UserInfo | null;
  isPremium: boolean;
  isPlanLoading?: boolean;
  featureSettings: UserFeatureSettings;
}): string {
  const { logoUrl, currentUser, isPremium, isPlanLoading = false, featureSettings } = params;

  const planBadgeHtml = currentUser
    ? isPlanLoading
      ? '<span class="lfa-header-control lfa-plan-badge lfa-plan-badge--loading" aria-hidden="true"></span>'
      : `<span class="lfa-header-control lfa-plan-badge${isPremium ? ' lfa-plan-badge--pro' : ' lfa-plan-badge--free'}" aria-label="Current plan: ${isPremium ? 'Pro' : 'Free'}">${isPremium ? 'Pro' : 'Free'}</span>`
    : '';

  const avatarHtml = currentUser
    ? currentUser.photoURL
      ? `<button class="lfa-header-control lfa-header-avatar-btn lfa-header-avatar-control" id="lfa-account-btn" type="button" aria-label="Account menu">
           <div class="lfa-header-avatar">
           <img src="${escapeHtml(currentUser.photoURL)}" alt=""
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
           <div class="lfa-avatar-fallback" style="display:none;">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="#666">
               <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
             </svg>
           </div>
           </div>
         </button>`
      : `<button class="lfa-header-control lfa-header-avatar-btn lfa-header-avatar-control" id="lfa-account-btn" type="button" aria-label="Account menu">
           <div class="lfa-header-avatar">
           <div class="lfa-avatar-fallback" style="display:flex;">
             <svg viewBox="0 0 24 24" width="16" height="16" fill="#666">
               <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
             </svg>
           </div>
           </div>
         </button>`
    : '';

  return `
    <div class="lfa-header-left">
      <div class="lfa-header-logo"><img src="${escapeHtml(logoUrl)}" alt="myFeedPilot" /></div>
      <span class="lfa-header-title">myFeedPilot</span>
    </div>
    <div class="lfa-header-right">
      ${planBadgeHtml}
      ${DASHBOARD_ENABLED ? '<button class="lfa-header-control lfa-header-dashboard-btn lfa-header-dashboard-control" id="lfa-header-dashboard-btn" type="button">Dashboard</button>' : ''}
      ${
        currentUser
          ? `
      <div class="lfa-settings-menu-wrap">
        <button class="lfa-header-control lfa-settings-btn lfa-header-settings-control" id="lfa-settings-btn" type="button" aria-label="Settings">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <div class="lfa-settings-menu" id="lfa-settings-menu">
          ${
            DASHBOARD_ENABLED
              ? `
          <button class="lfa-settings-link" id="lfa-manage-account-btn" type="button">
            <span class="lfa-settings-link-icon lfa-settings-link-icon--primary">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="10" cy="7" r="4"></circle>
              </svg>
            </span>
            <span>${CONTENT_COPY.common.manageAccount}</span>
          </button>
          <div class="lfa-settings-divider"></div>
          `
              : ''
          }
          <div class="lfa-settings-section-title">${CONTENT_COPY.common.features}</div>
          ${renderSettingsToggleRow('messagingButtons', 'Messaging buttons', featureSettings.messagingButtons, 'Show MyFeedIn buttons inside LinkedIn messaging conversations')}
          ${renderSettingsToggleRow('postButtons', 'Post buttons', featureSettings.postButtons, 'Show MyFeedIn buttons on LinkedIn feed posts')}
          <!-- ${renderSettingsToggleRow('speechToComment', 'Speech to comment', featureSettings.speechToComment, 'Show floating mic button on LinkedIn for voice comments')} -->
          ${renderSettingsToggleRow('hideProfileViewers', 'Hide Profile Visitors', featureSettings.hideProfileViewers, 'Hide the Profile Visitors list in the sidebar. Background collection will continue.')}
        </div>
      </div>`
          : ''
      }
      ${avatarHtml}
      ${
        currentUser
          ? `
      <div class="lfa-account-menu-wrap">
        <div class="lfa-account-menu" id="lfa-account-menu">
          <div class="lfa-account-menu-profile">
            <div class="lfa-account-menu-avatar">
              ${
                currentUser.photoURL
                  ? `<img src="${escapeHtml(currentUser.photoURL)}" alt="" />`
                  : `<div class="lfa-account-menu-avatar-fallback">
                     <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                       <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                     </svg>
                   </div>`
              }
            </div>
            <div class="lfa-account-menu-copy">
              <div class="lfa-account-menu-name">${escapeHtml(currentUser.displayName || 'User')}</div>
              <div class="lfa-account-menu-email">${escapeHtml(currentUser.email || '')}</div>
            </div>
          </div>
          <div class="lfa-account-menu-divider"></div>
          <button class="lfa-account-menu-link" id="lfa-profile-settings-btn" type="button">
            <span class="lfa-account-menu-link-icon lfa-account-menu-link-icon--profile">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path>
                <path d="M4 21a8 8 0 0 1 16 0"></path>
              </svg>
            </span>
            <span>Profile &amp; billing</span>
          </button>
          <button class="lfa-account-menu-link lfa-account-menu-link--plan" id="lfa-manage-plan-btn" type="button">
            <span class="lfa-account-menu-link-icon lfa-account-menu-link-icon--plan">
              ${renderPlanOutlineStarIcon({ className: 'lfa-plan-star-glyph' })}
            </span>
            <span>Manage plan</span>
          </button>
          ${
            DASHBOARD_ENABLED
              ? `
          <button class="lfa-account-menu-link" id="lfa-subscription-btn" type="button">
            <span class="lfa-account-menu-link-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                <path d="M2 10h20"></path>
              </svg>
            </span>
            <span>${CONTENT_COPY.common.subscription}</span>
          </button>
          `
              : ''
          }
          <button class="lfa-account-menu-link lfa-account-menu-link--danger" id="lfa-account-signout-btn" type="button">
            <span class="lfa-account-menu-link-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <path d="m16 17 5-5-5-5"></path>
                <path d="M21 12H9"></path>
              </svg>
            </span>
            <span>${CONTENT_COPY.common.signOut}</span>
          </button>
        </div>
      </div>`
          : ''
      }
    </div>
  `;
}

interface SidebarBodyParams {
  isLoading: boolean;
  isInitializing: boolean;
  isPremium: boolean;
  currentUser: UserInfo | null;
  authErrorMessage: string;
  sidebarSearchQuery: string;
  activeFeedTab: 'owned' | 'shared';
  feedsListCount: number;
  feedsHtml: string;
  editorOverlayHtml: string;
}

export function renderSidebarBody(params: SidebarBodyParams): string {
  const {
    isLoading,
    isInitializing,
    isPremium,
    currentUser,
    authErrorMessage,
    sidebarSearchQuery,
    activeFeedTab,
    feedsListCount,
    feedsHtml,
    editorOverlayHtml,
  } = params;
  const emptyCopy = getSidebarEmptyCopy(activeFeedTab, feedsListCount > 0);

  if (isLoading) {
    return `
      <div class="lfa-loading">
        <div class="lfa-spinner"></div>
        <p>${CONTENT_COPY.common.signingIn}</p>
      </div>
    `;
  }

  if (isInitializing) {
    return `
      <div class="lfa-loading">
        <div class="lfa-spinner"></div>
        <p>${CONTENT_COPY.common.loadingFeeds}</p>
      </div>
    `;
  }

  if (!currentUser) {
    return `
      <div class="lfa-unauth">
        <div class="lfa-unauth-icon">
          <svg viewBox="0 0 24 24" width="56" height="56" fill="#d1d5db">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <h2 class="lfa-unauth-title">${CONTENT_COPY.sidebar.signInTitle}</h2>
        <p class="lfa-unauth-desc">${CONTENT_COPY.sidebar.signInDescription}</p>
        <button class="lfa-signin-btn" id="lfa-signin-btn">${CONTENT_COPY.sidebar.signInButton}</button>
        <p class="lfa-unauth-hint">${CONTENT_COPY.sidebar.signInHint}</p>
        ${DASHBOARD_ENABLED ? `<a class="lfa-open-dashboard-link" id="lfa-open-dashboard-btn">${CONTENT_COPY.common.openDashboard}</a>` : ''}
        ${authErrorMessage ? `<p class="lfa-auth-error">${escapeHtml(authErrorMessage)}</p>` : ''}
      </div>
    `;
  }

  return `
    <div class="lfa-auth">
      <div class="lfa-tabs">
        <button class="lfa-tab${activeFeedTab === 'owned' ? ' active' : ''}" id="lfa-tab-owned" type="button">${CONTENT_COPY.sidebar.myFeeds}</button>
        <button class="lfa-tab${activeFeedTab === 'shared' ? ' active' : ''}" id="lfa-tab-shared" type="button">${CONTENT_COPY.sidebar.sharedWithMe}</button>
      </div>
      <div class="lfa-toolbar">
        <input type="text" class="lfa-search" placeholder="${activeFeedTab === 'owned' ? CONTENT_COPY.sidebar.searchFeedsPlaceholder : CONTENT_COPY.sidebar.searchSharedFeedsPlaceholder}" id="lfa-search" value="${escapeHtml(sidebarSearchQuery)}" />
        ${
          activeFeedTab === 'owned'
            ? `
          <!-- <button class="lfa-toolbar-dashboard-btn" id="lfa-toolbar-dashboard-btn" type="button" aria-label="${CONTENT_COPY.common.openDashboard}" title="${CONTENT_COPY.common.openDashboard}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
            </svg>
          </button> -->
          <button class="lfa-add-feed-btn" id="lfa-add-feed-btn">+ Feed</button>
        `
            : ''
        }
      </div>
      <div id="lfa-create-form-slot"></div>
      <div class="lfa-feed-list" id="lfa-feed-list">
        ${
          feedsHtml ||
          `<div class="lfa-empty">
             <p>${emptyCopy.title}</p>
             <p class="lfa-empty-hint">${emptyCopy.hint}</p>
          </div>`
        }
      </div>
      ${renderSupportFooter(isPremium)}
    </div>
    ${editorOverlayHtml}
  `;
}
