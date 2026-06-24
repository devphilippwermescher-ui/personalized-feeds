import type { FeedInfo } from '../types';
import { renderLfsIconButton } from '../../../shared/ui';

function renderFeedActionIcon(
  action:
    | 'edit'
    | 'add'
    | 'share'
    | 'delete'
    | 'duplicate'
    | 'unfollow'
    | 'refresh'
    | 'confirm'
    | 'cancel'
): string {
  if (action === 'edit') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
      </svg>
    `;
  }

  if (action === 'add') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M19 8v6"></path>
        <path d="M16 11h6"></path>
      </svg>
    `;
  }

  if (action === 'share') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="18" cy="5" r="3"></circle>
        <circle cx="6" cy="12" r="3"></circle>
        <circle cx="18" cy="19" r="3"></circle>
        <path d="M8.59 13.51 15.42 17.49"></path>
        <path d="M15.41 6.51 8.59 10.49"></path>
      </svg>
    `;
  }

  if (action === 'duplicate') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="11" height="11" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        <path d="M14.5 14.5v5"></path>
        <path d="M12 17h5"></path>
      </svg>
    `;
  }

  if (action === 'unfollow') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
  }

  if (action === 'refresh') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 0 1-15.5 6.2"></path>
        <path d="M3 12a9 9 0 0 1 15.5-6.2"></path>
        <path d="M18 2v4h-4"></path>
        <path d="M6 22v-4h4"></path>
      </svg>
    `;
  }

  if (action === 'confirm') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M20 6 9 17l-5-5"></path>
      </svg>
    `;
  }

  if (action === 'cancel') {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M18 6 6 18"></path>
        <path d="M6 6l12 12"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14H6L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M9 6V4h6v2"></path>
    </svg>
  `;
}

export function renderFeedActions(feed: FeedInfo): string {
  if (feed.isSystem) {
    if (feed.systemType !== 'profileViewers') {
      return '';
    }

    const isRefreshing = feed.isRefreshingProfileViewers === true;
    const isConfirming = feed.isConfirmingProfileViewersRefresh === true;
    if (isConfirming && !isRefreshing) {
      return `
        <div class="lfa-feed-actions lfa-feed-actions--confirm">
          <span class="lfa-feed-refresh-confirm-text" role="status">This will erase saved profile visitors and fetch them again.</span>
          ${renderLfsIconButton({
            iconHtml: renderFeedActionIcon('confirm'),
            title: 'Confirm refresh',
            variant: 'default',
            dataAttributes: {
              'feed-action': 'refreshProfileViewers',
              'feed-id': feed.id,
            },
          })}
          ${renderLfsIconButton({
            iconHtml: renderFeedActionIcon('cancel'),
            title: 'Cancel refresh',
            variant: 'default',
            dataAttributes: {
              'feed-action': 'refreshProfileViewersCancel',
              'feed-id': feed.id,
            },
          })}
        </div>
      `;
    }

    return `
      <div class="lfa-feed-actions">
        ${renderLfsIconButton({
          iconHtml: isRefreshing
            ? '<span class="lfa-feed-action-spinner" aria-hidden="true"></span>'
            : renderFeedActionIcon('refresh'),
          title: isRefreshing ? 'Refreshing profile visitors' : 'Refresh profile visitors',
          variant: 'default',
          disabled: isRefreshing,
          dataAttributes: {
            'feed-action': isRefreshing
              ? 'refreshProfileViewers'
              : 'refreshProfileViewersAsk',
            'feed-id': feed.id,
          },
        })}
      </div>
    `;
  }

  const actions: Array<{
    key: 'edit' | 'add' | 'share' | 'delete' | 'duplicate' | 'unfollow';
    title: string;
    disabled?: boolean;
    danger?: boolean;
  }> = feed.isShared
    ? [
        ...(feed.accessRole === 'editor' ? [{ key: 'add' as const, title: 'Add people' }] : []),
        { key: 'duplicate', title: 'Duplicate feed' },
        { key: 'unfollow', title: 'Unfollow feed', danger: true },
      ]
    : [
        { key: 'edit', title: 'Edit feed' },
        { key: 'add', title: 'Add people' },
        { key: 'share', title: 'Share feed' },
        { key: 'delete', title: 'Delete feed', danger: true },
      ];

  return `
    <div class="lfa-feed-actions">
      ${actions
        .map((action) =>
          renderLfsIconButton({
            iconHtml: renderFeedActionIcon(action.key),
            title: action.title,
            variant: action.danger ? 'danger' : 'default',
            disabled: action.disabled,
            dataAttributes: {
              'feed-action': action.key,
              'feed-id': feed.id,
            },
          })
        )
        .join('')}
    </div>
  `;
}
