import { describe, expect, it } from 'vitest';
import {
  buildMemberUpsertPatch,
  getCanonicalLinkedInUsername,
  memberMatchesProfileIdentity,
} from '../../../../../shared/linkedin-identity';

describe('getCanonicalLinkedInUsername', () => {
  it('prefers the public /in/ slug from linkedinUrl over an internal token username', () => {
    expect(
      getCanonicalLinkedInUsername({
        linkedinUsername: 'acoaad-k8p8bvbqtjpze3mdxlgvqcqsiruk7mqs',
        linkedinUrl: 'https://www.linkedin.com/in/alina-oharova-a7b718259/',
      })
    ).toBe('alina-oharova-a7b718259');
  });
});

describe('memberMatchesProfileIdentity', () => {
  it('matches modal-added member to profile-page identity via memberNumericId', () => {
    const existingMember = {
      linkedinUsername: 'ACoAAExampleToken',
      linkedinUrl: 'https://www.linkedin.com/in/ACoAAExampleToken?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAExampleToken',
      memberNumericId: '12605988',
      profileUrn: 'urn:li:fsd_profile:ACoAAExampleToken',
    };

    const profilePageIdentity = {
      linkedinUsername: 'alina-oharova',
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova/',
      memberNumericId: '12605988',
      profileUrn: '',
    };

    expect(memberMatchesProfileIdentity(existingMember, profilePageIdentity)).toBe(true);
  });

  it('matches by profileUrn token when usernames differ', () => {
    const existingMember = {
      linkedinUsername: 'ACoAAExampleToken',
      linkedinUrl: 'https://www.linkedin.com/in/ACoAAExampleToken/',
      memberNumericId: '',
      profileUrn: 'urn:li:fsd_profile:ACoAAExampleToken',
    };

    const incomingProfile = {
      linkedinUsername: 'alina-oharova',
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova/',
      memberNumericId: '',
      profileUrn: 'urn:li:fsd_profile:ACoAAExampleToken',
    };

    expect(memberMatchesProfileIdentity(existingMember, incomingProfile)).toBe(true);
  });
});

describe('buildMemberUpsertPatch', () => {
  it('enriches an existing member with a missing avatar and canonical username', () => {
    const existingMember = {
      linkedinUrl: 'https://www.linkedin.com/in/ACoAAExampleToken/',
      linkedinUsername: 'ACoAAExampleToken',
      profileUrn: '',
      memberNumericId: '',
      displayName: 'Alina Oharova',
      headline: '',
      profileImageUrl: '',
      company: '',
      location: '',
      connectionDegree: '',
      canMessage: false,
      canFollow: false,
      canConnect: false,
      isFollowing: false,
    };

    const profileData = {
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova/',
      linkedinUsername: 'alina-oharova',
      profileUrn: 'urn:li:fsd_profile:ACoAAExampleToken',
      memberNumericId: '12605988',
      displayName: 'Alina Oharova',
      headline: 'IT Recruiter',
      profileImageUrl: 'https://media.licdn.com/avatar.jpg',
      company: '',
      location: '',
      connectionDegree: '1st',
    };

    expect(buildMemberUpsertPatch(existingMember, profileData)).toMatchObject({
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova/',
      linkedinUsername: 'alina-oharova',
      profileUrn: 'urn:li:fsd_profile:ACoAAExampleToken',
      memberNumericId: '12605988',
      headline: 'IT Recruiter',
      profileImageUrl: 'https://media.licdn.com/avatar.jpg',
      connectionDegree: '1st',
    });
  });

  it('uses the public slug from linkedinUrl when the incoming username is an internal token', () => {
    const existingMember = {
      linkedinUrl: 'https://www.linkedin.com/in/acoaad-k8p8bvbqtjpze3mdxlgvqcqsiruk7mqs/',
      linkedinUsername: 'acoaad-k8p8bvbqtjpze3mdxlgvqcqsiruk7mqs',
      profileUrn: '',
      memberNumericId: '',
      displayName: 'Alina Oharova',
      headline: '',
      profileImageUrl: '',
      company: '',
      location: '',
      connectionDegree: '',
      canMessage: false,
      canFollow: false,
      canConnect: false,
      isFollowing: false,
    };

    const profileData = {
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova-a7b718259/',
      linkedinUsername: 'acoaad-k8p8bvbqtjpze3mdxlgvqcqsiruk7mqs',
      profileUrn: 'urn:li:fsd_profile:ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      memberNumericId: '1067774207',
      displayName: 'Alina Oharova',
      headline: 'IT Recruiter',
      profileImageUrl: '',
      company: '',
      location: '',
      connectionDegree: '',
    };

    expect(buildMemberUpsertPatch(existingMember, profileData)).toMatchObject({
      linkedinUrl: 'https://www.linkedin.com/in/alina-oharova-a7b718259/',
      linkedinUsername: 'alina-oharova-a7b718259',
      profileUrn: 'urn:li:fsd_profile:ACoAAD-k8P8BVBQtJpze3MdxLgVqCqsIrUk7Mqs',
      memberNumericId: '1067774207',
      headline: 'IT Recruiter',
    });
  });
});
