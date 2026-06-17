import type { FeedInfo } from '../../types';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

interface RenderFeedRowOptions {
  feed: FeedInfo;
  expanded: boolean;
  previewHtml: string;
  expandedContentHtml?: string;
}

export function renderFeedRow({
  feed,
  expanded,
  previewHtml,
  expandedContentHtml = '',
}: RenderFeedRowOptions): string {
  const isShared = Boolean(feed.isShared);
  const isSystem = Boolean(feed.isSystem);
  const isProfileViewers = feed.systemType === 'profileViewers';
  const hasPrivateViewerCount =
    isProfileViewers &&
    Number.isSafeInteger(feed.privateViewerCount) &&
    (feed.privateViewerCount || 0) >= 0;
  const privateViewerCount = feed.privateViewerCount || 0;
  const recruiterViewerCount =
    isProfileViewers &&
    Number.isSafeInteger(feed.recruiterViewerCount) &&
    (feed.recruiterViewerCount || 0) > 0
      ? feed.recruiterViewerCount || 0
      : 0;
  const hiddenViewerCount = privateViewerCount + recruiterViewerCount;
  const hasHiddenViewerCount = isProfileViewers && (hasPrivateViewerCount || recruiterViewerCount > 0);
  const viewerCountLabel = hasHiddenViewerCount
    ? `${feed.memberCount || 0} / ${hiddenViewerCount}`
    : `${feed.memberCount || 0}`;
  const visibleEntryCount = feed.memberCount || 0;
  const hiddenViewerDetails = [
    privateViewerCount > 0
      ? `${privateViewerCount} private-mode ${privateViewerCount === 1 ? 'visitor' : 'visitors'}`
      : '',
    recruiterViewerCount > 0
      ? `${recruiterViewerCount} recruiter ${recruiterViewerCount === 1 ? 'view' : 'views'}`
      : '',
  ].filter(Boolean).join(' and ');
  const viewerCountTooltip = hasHiddenViewerCount
    ? `${visibleEntryCount} visible visitor ${visibleEntryCount === 1 ? 'entry' : 'entries'} saved. LinkedIn reports ${hiddenViewerDetails || `${hiddenViewerCount} additional visitors`}.`
    : '';
  const itemClasses = [
    'lfa-feed-item',
    isShared ? 'lfa-feed-item--shared' : '',
    isSystem ? 'lfa-feed-item--system' : '',
    expanded ? 'lfa-feed-item--expanded' : '',
  ].filter(Boolean).join(' ');
  const groupClasses = [
    'lfa-feed-group',
    isProfileViewers ? 'lfa-feed-group--system' : '',
  ].filter(Boolean).join(' ');
  const leadingIcon = isProfileViewers
    ? `
        <span class="lfa-feed-pin-wrap">
          <span class="lfa-feed-pin" role="img" tabindex="0" aria-label="Pinned system feed">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 17v5"></path>
              <path d="M5 17h14"></path>
              <path d="M17 17v-5l-2-2V4H9v6l-2 2v5"></path>
            </svg>
          </span>
          <span class="lfa-feed-pin-tooltip" role="tooltip">You can hide this list in Settings</span>
        </span>
      `
    : `
        <svg class="lfa-feed-grip${isShared ? ' lfa-feed-grip--hidden' : ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.3"></circle>
          <circle cx="9" cy="12" r="1.3"></circle>
          <circle cx="9" cy="18" r="1.3"></circle>
          <circle cx="15" cy="6" r="1.3"></circle>
          <circle cx="15" cy="12" r="1.3"></circle>
          <circle cx="15" cy="18" r="1.3"></circle>
        </svg>
      `;

  return `
    <div class="${groupClasses}" data-feed-group-id="${escapeHtml(feed.id)}">
      <div class="${itemClasses}" data-feed-id="${escapeHtml(feed.id)}" draggable="${isShared || isSystem ? 'false' : 'true'}">
        ${leadingIcon}
        <div class="lfa-feed-name-wrap">
          <div class="lfa-feed-title-row">
            <button class="lfa-feed-name" type="button">${escapeHtml(feed.name)}</button>
            ${
              isProfileViewers
                ? `
                  <span class="lfa-feed-info-wrap">
                    <button class="lfa-feed-info" type="button" aria-label="About this system feed">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9"></circle>
                        <path d="M12 11v5"></path>
                        <path d="M12 8h.01"></path>
                      </svg>
                    </button>
                    <span class="lfa-feed-info-tooltip" role="tooltip">Auto-saved from LinkedIn</span>
                  </span>
                `
                : ''
            }
          </div>
          ${
            isShared
              ? `<span class="lfa-feed-owner-badge">by ${escapeHtml(feed.ownerDisplayName || 'Unknown')}</span>`
              : ''
          }
        </div>
        <div class="lfa-feed-meta">
          ${isShared ? `<span class="lfa-feed-role">${feed.accessRole === 'editor' ? 'Editor' : 'Reader'}</span>` : ''}
          ${previewHtml}
          ${
            isProfileViewers && hasHiddenViewerCount
              ? `
                <span class="lfa-profile-viewer-count-wrap">
                  <span class="lfa-profile-viewer-count" tabindex="0" aria-label="${escapeHtml(viewerCountTooltip)}">${escapeHtml(viewerCountLabel)}</span>
                  <span class="lfa-profile-viewer-count-tooltip" role="tooltip">${escapeHtml(viewerCountTooltip)}</span>
                </span>
              `
              : `<span>${escapeHtml(viewerCountLabel)}</span>`
          }
          <span class="lfa-feed-chevron ${expanded ? 'expanded' : ''}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"></path>
            </svg>
          </span>
        </div>
      </div>
      ${expanded ? `<div class="lfa-feed-expanded">${expandedContentHtml}</div>` : ''}
    </div>
  `;
}
