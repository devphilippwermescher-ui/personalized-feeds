import { describe, expect, it } from 'vitest';
import { renderMemberRow } from '../components/MemberRow/MemberRow';

describe('LinkedIn Premium member icons', () => {
  it('keeps Premium data but hides the icon in Profile Visitors and feed rows', () => {
    const html = renderMemberRow({
      feedId: 'feed-1',
      member: {
        id: 'member-1',
        linkedinUrl: 'https://www.linkedin.com/in/premium-member/',
        linkedinUsername: 'premium-member',
        displayName: 'Premium Member',
        isPremium: true,
        addedAt: 123,
      },
      messageButtonHtml: '',
      statusActionHtml: '',
    });

    expect(html).toContain('Premium Member');
    expect(html).not.toContain('lfa-member-premium-icon');
    expect(html).not.toContain('LinkedIn Premium');
  });
});
