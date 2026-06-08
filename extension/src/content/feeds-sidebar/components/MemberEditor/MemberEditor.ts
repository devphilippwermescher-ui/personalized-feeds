import type { FeedInfo, MemberEditorState } from '../../types';
import { getMemberInitials } from '../../utils';
import { renderLfsDropdown, renderLfsInput } from '../../../../shared/ui';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMemberEditorOverlay(
  activeMemberEditor: MemberEditorState | null,
  feedsList: FeedInfo[]
): string {
  if (!activeMemberEditor) {
    return '';
  }

  const { member, feedName } = activeMemberEditor;
  const feedDropdownOptions = feedsList.map((feed) => ({
    value: feed.id,
    label: feed.name,
  }));

  return `
    <div class="lfa-member-editor">
      <div class="lfa-member-editor-header">
        <button class="lfa-member-editor-back" id="lfa-member-editor-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"></path>
          </svg>
          Back
        </button>
        <button class="lfa-member-editor-close" id="lfa-member-editor-close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="lfa-member-editor-body">
        <div class="lfa-member-editor-profile">
          ${
            member.profileImageUrl
              ? `<img class="lfa-member-editor-avatar" src="${escapeHtml(member.profileImageUrl)}" alt="${escapeHtml(member.displayName)}" data-lfa-avatar-img="true" /><div class="lfa-member-editor-avatar lfa-member-editor-avatar--fallback" style="display:none;">${escapeHtml(getMemberInitials(member.displayName))}</div>`
              : `<div class="lfa-member-editor-avatar lfa-member-editor-avatar--fallback">${escapeHtml(getMemberInitials(member.displayName))}</div>`
          }
          <div>
            <div class="lfa-member-editor-name">${escapeHtml(member.displayName)}</div>
            <div class="lfa-member-editor-headline">${escapeHtml(member.headline || member.company || member.linkedinUsername)}</div>
            <div class="lfa-member-editor-feed">Current feed: ${escapeHtml(feedName)}</div>
          </div>
        </div>

        <div class="lfa-member-editor-grid">
          ${renderLfsDropdown({
            id: 'lfa-member-edit-feed',
            label: 'Feed',
            options: feedDropdownOptions,
            selectedValue: activeMemberEditor.feedId,
            placeholder: 'Select feed...',
            helper: 'Choose which feed this profile belongs to.',
          })}
          ${renderLfsInput({
            id: 'lfa-member-edit-name',
            label: 'Name',
            value: member.displayName || '',
            placeholder: 'Full name',
          })}
          ${renderLfsInput({
            id: 'lfa-member-edit-email',
            label: 'Email',
            type: 'email',
            value: member.email || '',
            placeholder: 'Add email...',
          })}
          ${renderLfsInput({
            id: 'lfa-member-edit-company',
            label: 'Company',
            value: member.company || '',
            placeholder: 'Company',
          })}
          ${renderLfsInput({
            id: 'lfa-member-edit-headline',
            label: 'Job Title',
            value: member.headline || '',
            placeholder: 'Job title',
          })}
          ${renderLfsInput({
            id: 'lfa-member-edit-location',
            label: 'Location',
            value: member.location || '',
            placeholder: 'Location',
          })}
          ${renderLfsInput({
            id: 'lfa-member-edit-url',
            label: 'LinkedIn URL',
            type: 'url',
            value: member.linkedinUrl || '',
            placeholder: 'https://www.linkedin.com/in/...',
          })}
        </div>
      </div>
      <div class="lfa-member-editor-footer">
        <button class="lfa-member-editor-save" id="lfa-member-editor-save">Save changes</button>
      </div>
    </div>
  `;
}
