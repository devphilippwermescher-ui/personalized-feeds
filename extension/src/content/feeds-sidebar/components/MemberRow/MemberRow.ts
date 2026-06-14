import type { FeedMemberInfo } from '../../types';
import { getMemberInitials } from '../../utils';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMemberMeta(member: FeedMemberInfo): string {
  const metaParts = [member.headline, member.viewedAgoText, member.mutualConnectionsText]
    .map((item) => (item || '').trim())
    .filter(Boolean);

  if (metaParts.length === 0) {
    return '';
  }

  return `<div class="lfa-member-meta">${escapeHtml(metaParts.join(' - '))}</div>`;
}

interface RenderMemberRowOptions {
  feedId: string;
  member: FeedMemberInfo;
  messageButtonHtml: string;
  statusActionHtml: string;
  canEdit?: boolean;
  showMeta?: boolean;
}

export function renderMemberRow({
  feedId,
  member,
  messageButtonHtml,
  statusActionHtml,
  canEdit = true,
  showMeta = false,
}: RenderMemberRowOptions): string {
  if (member.itemType === 'search') {
    return `
      <div class="lfa-member-row lfa-member-row--search" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}">
        <div class="lfa-member-main">
          <div class="lfa-member-avatar lfa-member-avatar--search" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="currentColor"></circle>
              <path d="M4.5 21a7.5 7.5 0 0 1 15 0" fill="currentColor"></path>
            </svg>
          </div>
          <div class="lfa-member-info">
            <button class="lfa-member-name" data-member-action="open-profile" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" type="button">
              <span class="lfa-member-name-text">${escapeHtml(member.displayName)}</span>
            </button>
          </div>
        </div>
        <div class="lfa-member-actions lfa-member-actions--search">
          <button class="lfa-member-search-btn" data-member-action="open-profile" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" type="button">
            Search
          </button>
        </div>
      </div>
    `;
  }

  const hasActions = Boolean(messageButtonHtml || statusActionHtml || canEdit);

  return `
    <div class="lfa-member-row${showMeta ? ' lfa-member-row--with-meta' : ''}" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}">
      <div class="lfa-member-main">
        ${
          member.profileImageUrl
            ? `<img class="lfa-member-avatar" src="${escapeHtml(member.profileImageUrl)}" alt="${escapeHtml(member.displayName)}" data-lfa-avatar-img="true" /><div class="lfa-member-avatar lfa-member-avatar--fallback" style="display:none;">${escapeHtml(getMemberInitials(member.displayName))}</div>`
            : `<div class="lfa-member-avatar lfa-member-avatar--fallback">${escapeHtml(getMemberInitials(member.displayName))}</div>`
        }
        <div class="lfa-member-info">
          <button class="lfa-member-name" data-member-action="open-profile" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" type="button">
            <span class="lfa-member-name-text">${escapeHtml(member.displayName)}</span>${member.isPremium ? ' <span class="lfa-member-premium-icon" title="LinkedIn Premium" aria-label="LinkedIn Premium">✦</span>' : ''}
          </button>
          ${showMeta ? renderMemberMeta(member) : ''}
        </div>
      </div>
      <div class="lfa-member-actions${hasActions ? '' : ' lfa-member-actions--empty'}">
        ${messageButtonHtml}
        ${canEdit ? `
        <button class="lfa-member-icon-btn" data-member-action="edit" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" title="Edit profile">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
          </svg>
        </button>
        <button class="lfa-member-icon-btn lfa-member-icon-btn--danger" data-member-action="delete" data-member-id="${escapeHtml(member.id)}" data-feed-id="${escapeHtml(feedId)}" title="Remove from feed">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14H6L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4h6v2"></path>
          </svg>
        </button>` : ''}
        ${statusActionHtml}
      </div>
    </div>
  `;
}
