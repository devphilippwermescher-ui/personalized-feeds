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
    expect(html).not.toContain('Viewed 1 month ago');
    expect(html).not.toContain('lfa-member-meta');
    expect(html).toContain('lfa-member-avatar--search');
    expect(html).toContain('lfa-member-search-btn');
    expect(html).toMatch(/>\s*Search\s*<\/button>/);
    expect(html).not.toContain('data-member-action="edit"');
    expect(html).not.toContain('data-member-action="delete"');
    expect(html).not.toContain('Connect');
  });

  it('falls back to keywords when a stored search display name is a LinkedIn URL', () => {
    const member: FeedMemberInfo = {
      id: 'search-url',
      itemType: 'search',
      searchKey:
        'currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      linkedinUrl:
        'https://www.linkedin.com/search/results/people/?currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      linkedinUsername: '',
      displayName:
        'https://www.linkedin.com/search/results/people/?currentCompany=1053414&keywords=Software+Developer&origin=WHO_VIEWED_ME',
      addedAt: 1,
    };

    const html = renderMemberRow({
      feedId: '__profile_viewers__',
      member,
      messageButtonHtml: '',
      statusActionHtml: '',
      canEdit: false,
    });

    expect(html).toContain('Software Developer');
    expect(html).not.toContain('https://www.linkedin.com/search/results/people');
  });

  it('renders the recruiter aggregate as a view-only LinkedIn row', () => {
    const member: FeedMemberInfo = {
      id: '__profile_viewers_recruiters__',
      itemType: 'recruiterAggregate',
      linkedinUrl:
        'https://www.linkedin.com/analytics/recruiter-views/?timeRange=WvmpSearchFilterTimeRange_LAST_90_DAYS',
      linkedinUsername: '',
      displayName: '32 recruiters viewed your profile',
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

    expect(html).toContain('32 recruiters viewed your profile');
    expect(html).not.toContain('View all recruiters on LinkedIn');
    expect(html).toContain('lfa-member-avatar--recruiters');
    expect(html).toMatch(/>\s*View\s*<\/button>/);
    expect(html).not.toContain('data-member-action="edit"');
    expect(html).not.toContain('Connect');
  });

  it('does not render streamed RSC fragments as search display names', () => {
    const member: FeedMemberInfo = {
      id: 'search-bad',
      itemType: 'search',
      searchKey: 'keywords=Recruiter&currentCompany=750470',
      linkedinUrl:
        'https://www.linkedin.com/search/results/people/?keywords=Recruiter&origin=WHO_VIEWED_ME&currentCompany=750470',
      linkedinUsername: '',
      displayName: '}}]]}]]}]}',
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

    expect(html).toContain('Recruiter');
    expect(html).not.toContain('}}');
  });
});
