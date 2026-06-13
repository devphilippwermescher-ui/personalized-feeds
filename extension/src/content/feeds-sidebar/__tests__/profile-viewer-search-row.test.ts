import { describe, expect, it } from 'vitest';
import { renderMemberRow } from '../components/MemberRow/MemberRow';
import type { FeedMemberInfo } from '../types';

describe('profile viewer search row', () => {
  it('renders LinkedIn-style search information without profile actions', () => {
    const member: FeedMemberInfo = {
      id: 'search-1',
      itemType: 'search',
      searchKey:
        'currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      linkedinUrl:
        'https://www.linkedin.com/search/results/people/?currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      linkedinUsername: '',
      displayName: 'Software Developer at MagView',
      viewedAgoText: 'Viewed 1 month ago',
      addedAt: 1,
    };

    const html = renderMemberRow({
      feedId: '__profile_viewers__',
      member,
      messageButtonHtml: '',
      statusActionHtml: '',
      canEdit: false,
      showMeta: true,
    });

    expect(html).toContain('Software Developer at MagView');
    expect(html).toContain('Viewed 1 month ago');
    expect(html).toContain('lfa-member-avatar--search');
    expect(html).toContain('lfa-member-search-btn');
    expect(html).toMatch(/>\s*Search\s*<\/button>/);
    expect(html).not.toContain('data-member-action="edit"');
    expect(html).not.toContain('data-member-action="delete"');
    expect(html).not.toContain('Connect');
  });
});
