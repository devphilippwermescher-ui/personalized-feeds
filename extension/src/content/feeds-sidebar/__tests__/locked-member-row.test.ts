import { describe, expect, it } from 'vitest';
import { renderMemberRow } from '../components/MemberRow/MemberRow';

describe('locked feed member row', () => {
  it('keeps the profile visible while disabling profile and edit actions', () => {
    const html = renderMemberRow({
      feedId: 'feed-1',
      member: {
        id: 'member-11',
        linkedinUrl: 'https://www.linkedin.com/in/member-11/',
        linkedinUsername: 'member-11',
        displayName: 'Locked Member',
        addedAt: 1,
        isLockedByPlan: true,
      },
      messageButtonHtml: '',
      statusActionHtml: '',
      canEdit: false,
      canRemove: true,
      isLocked: true,
    });

    expect(html).toContain('Locked Member');
    expect(html).toContain('lfa-member-row--locked');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('data-member-action="open-profile"');
    expect(html).not.toContain('data-member-action="edit"');
    expect(html).toContain('data-member-action="delete"');
  });
});
