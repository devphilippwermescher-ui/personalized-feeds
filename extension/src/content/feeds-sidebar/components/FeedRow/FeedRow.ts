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
  const itemClasses = [
    'lfa-feed-item',
    isShared ? 'lfa-feed-item--shared' : '',
    isSystem ? 'lfa-feed-item--system' : '',
    expanded ? 'lfa-feed-item--expanded' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="lfa-feed-group" data-feed-group-id="${escapeHtml(feed.id)}">
      <div class="${itemClasses}" data-feed-id="${escapeHtml(feed.id)}" draggable="${isShared || isSystem ? 'false' : 'true'}">
        <svg class="lfa-feed-grip${isShared || isSystem ? ' lfa-feed-grip--hidden' : ''}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.3"></circle>
          <circle cx="9" cy="12" r="1.3"></circle>
          <circle cx="9" cy="18" r="1.3"></circle>
          <circle cx="15" cy="6" r="1.3"></circle>
          <circle cx="15" cy="12" r="1.3"></circle>
          <circle cx="15" cy="18" r="1.3"></circle>
        </svg>
        <div class="lfa-feed-name-wrap">
          <button class="lfa-feed-name" type="button">${escapeHtml(feed.name)}</button>
          ${
            isShared
              ? `<span class="lfa-feed-owner-badge">by ${escapeHtml(feed.ownerDisplayName || 'Unknown')}</span>`
              : isSystem
                ? `<span class="lfa-feed-owner-badge">auto-saved from LinkedIn</span>`
              : ''
          }
        </div>
        <div class="lfa-feed-meta">
          ${isShared ? `<span class="lfa-feed-role">${feed.accessRole === 'editor' ? 'Editor' : 'Reader'}</span>` : ''}
          ${previewHtml}
          <span>${feed.memberCount || 0}</span>
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
