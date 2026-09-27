import { describe, expect, it } from 'vitest';
import { parseLinkedInProfileIdentity } from '../profile-identity-resolver';

describe('LinkedIn profile identity parsing', () => {
  it('reads the current profile location from the Dash profile response', () => {
    expect(
      parseLinkedInProfileIdentity({
        data: {
          data: {
            identityDashProfilesByMemberIdentity: {
              elements: [
                {
                  entityUrn: 'urn:li:fsd_profile:abc123',
                  publicIdentifier: 'example-user',
                  firstName: 'Example',
                  lastName: 'User',
                  geoLocationName: 'Kharkiv, Ukraine',
                },
              ],
            },
          },
        },
      })
    ).toEqual({
      linkedinUsername: 'example-user',
      profileUrn: 'urn:li:fsd_profile:abc123',
      displayName: 'Example User',
      location: 'Kharkiv, Ukraine',
    });
  });

  it('keeps identity usable when LinkedIn omits location', () => {
    expect(
      parseLinkedInProfileIdentity({
        publicIdentifier: 'example-user',
        entityUrn: 'urn:li:fsd_profile:abc123',
      })
    ).toMatchObject({ linkedinUsername: 'example-user', profileUrn: 'urn:li:fsd_profile:abc123' });
  });
});
