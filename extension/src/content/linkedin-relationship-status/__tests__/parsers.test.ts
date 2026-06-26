import { describe, it, expect } from 'vitest';
import {
  parseStatusFromRehydration,
  parseGraphQLRelationshipStatus,
  parseProfileImageUrlFromHtml,
} from '../parsers';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeHtml(body: string): string {
  return `<!DOCTYPE html><html><body>${body}</body></html>`;
}

function rehydrationScript(state: Record<string, unknown>): string {
  return `<script>window.__como_rehydration__ = ${JSON.stringify(state)};</script>`;
}

// ── Edge case: 3rd degree + Message CTA + hidden Connect + Following state ─

const PROFILE_URN = 'urn:li:fsd_profile:ACoAAD-GGcUBpTest';
const MEMBER_ID = '987654321';

/**
 * This fixture simulates a premium/limited LinkedIn profile where:
 * - The viewer sees "3rd" degree badge in the page
 * - A "Message" CTA is visible (InMail / premium contact)
 * - The hidden rehydration state shows invitation = "Connect" (NOT connected)
 * - The hidden following state shows the viewer is "Following" this person
 *
 * Expected: status MUST NOT be "connected".
 * The invitation state "Connect" takes precedence, so status = "connect".
 * isFollowing should be true.
 */
const FIXTURE_REHYDRATION_STATE = {
  [PROFILE_URN]: { entityUrn: PROFILE_URN, firstName: 'Test', lastName: 'Profile' },
  [`state:invitation:urn:li:member:${MEMBER_ID}`]: { stringValue: 'Connect' },
  [`urn:li:fsd_followingState:urn:li:member:${MEMBER_ID}`]: { stringValue: 'Following' },
};

const FIXTURE_HTML_REHYDRATION = makeHtml(`
  ${rehydrationScript(FIXTURE_REHYDRATION_STATE)}
  <span>3rd</span>
  <button aria-label="Message Test Profile">Message</button>
`);

// ── parseStatusFromRehydration ─────────────────────────────────────────────

describe('parseStatusFromRehydration', () => {
  it('returns connect (not connected) for 3rd+Message+Connect hidden state', () => {
    const result = parseStatusFromRehydration(FIXTURE_HTML_REHYDRATION);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('connect');
    expect(result?.status).not.toBe('connected');
  });

  it('preserves isFollowing=true when following state is Following', () => {
    const result = parseStatusFromRehydration(FIXTURE_HTML_REHYDRATION);
    expect(result?.isFollowing).toBe(true);
    expect(result?.canFollow).toBe(true);
  });

  it('preserves memberNumericId from state key', () => {
    const result = parseStatusFromRehydration(FIXTURE_HTML_REHYDRATION);
    expect(result?.memberNumericId).toBe(MEMBER_ID);
  });

  it('preserves profileUrn from state keys', () => {
    const result = parseStatusFromRehydration(FIXTURE_HTML_REHYDRATION);
    expect(result?.profileUrn).toBe(PROFILE_URN);
  });

  it('returns pending for invitation state = Pending', () => {
    const html = makeHtml(rehydrationScript({
      [`state:invitation:urn:li:member:${MEMBER_ID}`]: { stringValue: 'Pending' },
    }));
    const result = parseStatusFromRehydration(html);
    expect(result?.status).toBe('pending');
    expect(result?.canConnect).toBe(false);
  });

  it('returns withdrawn for invitation state = Withdrawn', () => {
    const html = makeHtml(rehydrationScript({
      [`state:invitation:urn:li:member:${MEMBER_ID}`]: { stringValue: 'Withdrawn' },
    }));
    const result = parseStatusFromRehydration(html);
    expect(result?.status).toBe('withdrawn');
  });

  it('returns following when only follow state = Following (no invitation key)', () => {
    const html = makeHtml(rehydrationScript({
      [`urn:li:fsd_followingState:urn:li:member:${MEMBER_ID}`]: { stringValue: 'Following' },
    }));
    const result = parseStatusFromRehydration(html);
    expect(result?.status).toBe('following');
    expect(result?.isFollowing).toBe(true);
  });

  it('returns null when no rehydration script is present', () => {
    const html = makeHtml('<p>No script here</p>');
    expect(parseStatusFromRehydration(html)).toBeNull();
  });

  it('returns null when rehydration state has no recognizable keys', () => {
    const html = makeHtml(rehydrationScript({ someOtherKey: { value: 'x' } }));
    expect(parseStatusFromRehydration(html)).toBeNull();
  });

  it('does not crash on very large HTML with escaped strings', () => {
    const padding = '"key":"value with \\"escaped\\" quotes and {braces} galore",'.repeat(500);
    const state = `{"${padding}state:invitation:urn:li:member:111":{"stringValue":"Pending"}}`;
    const html = makeHtml(`<script>window.__como_rehydration__ = ${state};</script>`);
    // Should not throw; may or may not parse (JSON is unusual here)
    expect(() => parseStatusFromRehydration(html)).not.toThrow();
  });
});

// ── GraphQL profile image ─────────────────────────────────────────────────

describe('parseGraphQLRelationshipStatus profile image', () => {
  it('returns unavailable for LinkedIn GraphQL profile access denied errors', () => {
    const result = parseGraphQLRelationshipStatus({
      data: {
        identityDashProfilesByMemberIdentity: null,
      },
      errors: [
        {
          path: ['identityDashProfilesByMemberIdentity'],
          locations: [],
          extensions: {
            classification: 'DataFetchingException',
            exceptionClass: 'com.linkedin.voyager.common.VoyagerUserVisibleException',
            status: 403,
          },
          message: "This profile can't be accessed",
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      canMessage: false,
      canFollow: false,
      canConnect: false,
      isFollowing: false,
    });
  });

  it('extracts a refreshed profileImageUrl from LinkedIn vector image data', () => {
    const rootUrl = 'https://media.licdn.com/dms/image/v2/D4E03AQGUtBZh5nnOEQ/profile-displayphoto-';
    const path100 = 'scale_100_100/B4EZgS1szcGoAg-/0/1752662724807?e=1782345600&v=beta&t=small';
    const path800 = 'crop_800_800/B4EZgS1szcGoAM-/0/1752662724619?e=1782345600&v=beta&t=large';
    const result = parseGraphQLRelationshipStatus({
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: PROFILE_URN,
              profileStatefulProfileActions: {
                primaryActionResolutionResult: {
                  composeOption: {
                    composeOptionType: 'CONNECTION_MESSAGE',
                  },
                },
              },
              profilePicture: {
                displayImageReferenceResolutionResult: {
                  vectorImage: {
                    rootUrl,
                    artifacts: [
                      { width: 100, fileIdentifyingUrlPathSegment: path100 },
                      { width: 800, fileIdentifyingUrlPathSegment: path800 },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    });

    expect(result?.status).toBe('connected');
    expect(result?.profileImageUrl).toBe(`${rootUrl}${path800}`);
  });

  it('extracts profileImageUrl from nested connectedMemberResolutionResult data', () => {
    const rootUrl = 'https://media.licdn.com/dms/image/v2/D5603AQFf33wVH9aHpQ/profile-displayphoto-shrink_';
    const path100 = '100_100/profile-displayphoto-shrink_100_100/0/1722972493784?e=1782345600&v=beta&t=small';
    const path800 = '800_800/profile-displayphoto-shrink_800_800/0/1722972493804?e=1782345600&v=beta&t=large';
    const result = parseGraphQLRelationshipStatus({
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: PROFILE_URN,
              profileStatefulProfileActions: {
                primaryActionResolutionResult: {
                  composeOption: {
                    composeOptionType: 'CONNECTION_MESSAGE',
                  },
                },
                overflowActionsResolutionResults: [
                  {
                    connection: {
                      memberRelationship: {
                        memberRelationship: {
                          connection: {
                            connectedMemberResolutionResult: {
                              entityUrn: PROFILE_URN,
                              profilePicture: {
                                displayImageReferenceResolutionResult: {
                                  vectorImage: {
                                    rootUrl,
                                    artifacts: [
                                      { width: 100, fileIdentifyingUrlPathSegment: path100 },
                                      { width: 800, fileIdentifyingUrlPathSegment: path800 },
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(result?.status).toBe('connected');
    expect(result?.profileImageUrl).toBe(`${rootUrl}${path800}`);
  });

  it('does not use mutual-connection images as the target profileImageUrl', () => {
    const result = parseGraphQLRelationshipStatus({
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: PROFILE_URN,
              profileInsight: {
                elements: [
                  {
                    insightImage: {
                      attributes: [
                        {
                          detailData: {
                            profilePicture: {
                              entityUrn: 'urn:li:fsd_profile:ACoAAMutual',
                              profilePicture: {
                                displayImageReferenceResolutionResult: {
                                  vectorImage: {
                                    rootUrl: 'https://media.licdn.com/dms/image/v2/D4D03AQMutual/profile-displayphoto-shrink_',
                                    artifacts: [
                                      {
                                        width: 800,
                                        fileIdentifyingUrlPathSegment: '800_800/profile-displayphoto-shrink_800_800/0/1699956580320?e=1782345600&v=beta&t=mutual',
                                      },
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
              profileStatefulProfileActions: {
                primaryActionResolutionResult: {
                  statefulAction: {
                    actionDataModel: {
                      relationshipActionData: {
                        relationshipData: {
                          connectionOrInvitation: {
                            memberRelationship: {
                              noConnection: { noInvitation: {} },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });

    expect(result?.status).toBe('connect');
    expect(result?.profileImageUrl).toBe('');
  });

  it('resolves LinkedIn GraphQL data.data *elements through included entities', () => {
    const result = parseGraphQLRelationshipStatus({
      data: {
        data: {
          identityDashProfilesByMemberIdentity: {
            '*elements': [PROFILE_URN],
          },
        },
      },
      included: [
        {
          entityUrn: PROFILE_URN,
          profileStatefulProfileActions: {
            primaryActionResolutionResult: {
              statefulAction: {
                actionDataModel: {
                  targetUrn: `urn:li:member:${MEMBER_ID}`,
                  relationshipActionData: {
                    relationshipData: {
                      connectionOrInvitation: {
                        memberRelationship: {
                          noConnection: { noInvitation: {} },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          followingState: { following: false },
        },
      ],
    });

    expect(result?.status).toBe('connect');
    expect(result?.profileUrn).toBe(PROFILE_URN);
    expect(result?.memberNumericId).toBe(MEMBER_ID);
    expect(result?.isFollowing).toBe(false);
  });
});

describe('parseProfileImageUrlFromHtml', () => {
  it('extracts target profile image from LinkedIn code block vector image data', () => {
    const rootUrl = 'https://media.licdn.com/dms/image/v2/D4D03AQTarget/profile-displayphoto-shrink_';
    const path100 = '100_100/profile-displayphoto-shrink_100_100/0/1702908883519?e=1782345600&v=beta&t=small';
    const path800 = '800_800/profile-displayphoto-shrink_800_800/0/1702908883519?e=1782345600&v=beta&t=large';
    const html = makeHtml(`
      <code>${JSON.stringify({
        included: [
          {
            entityUrn: 'urn:li:fsd_profile:ACoAOther',
            profilePicture: {
              displayImageReferenceResolutionResult: {
                vectorImage: {
                  rootUrl: 'https://media.licdn.com/dms/image/v2/D4D03AQOther/profile-displayphoto-shrink_',
                  artifacts: [{ width: 800, fileIdentifyingUrlPathSegment: '800_800/other?e=1782345600&v=beta&t=other' }],
                },
              },
            },
          },
          {
            entityUrn: PROFILE_URN,
            profilePicture: {
              displayImageReferenceResolutionResult: {
                vectorImage: {
                  rootUrl,
                  artifacts: [
                    { width: 100, fileIdentifyingUrlPathSegment: path100 },
                    { width: 800, fileIdentifyingUrlPathSegment: path800 },
                  ],
                },
              },
            },
          },
        ],
      })}</code>
    `);

    expect(parseProfileImageUrlFromHtml(html, PROFILE_URN)).toBe(`${rootUrl}${path800}`);
  });

  it('extracts the largest top-card profile image from LinkedIn preload srcset', () => {
    const expectedUrl = 'https://media.licdn.com/dms/image/v2/C4D03AQH6T2Q_-MO3-w/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1638533606577?e=1782345600&v=beta&t=large';
    const html = makeHtml(`
      <link rel="preload" as="image" imageSrcSet="
        https://media.licdn.com/dms/image/v2/C4D03AQH6T2Q_-MO3-w/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1638533606577?e=1782345600&amp;v=beta&amp;t=small 100w,
        https://media.licdn.com/dms/image/v2/C4D03AQH6T2Q_-MO3-w/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1638533606577?e=1782345600&amp;v=beta&amp;t=medium 400w,
        ${expectedUrl.replace(/&/g, '&amp;')} 800w
      "/>
      <link rel="preload" as="image" imageSrcSet="
        https://media.licdn.com/dms/image/v2/C4D16AQBackground/profile-displaybackgroundimage-shrink_350_1400/profile-displaybackgroundimage-shrink_350_1400/0/1646297637731?e=1782345600&amp;v=beta&amp;t=background 1280w
      "/>
    `);

    expect(parseProfileImageUrlFromHtml(html, PROFILE_URN)).toBe(expectedUrl);
  });

  it('extracts a profile image from rehydration suffixUrl media data', () => {
    const html = makeHtml(`
      <script>
        window.__como_rehydration__ = {
          "media": {
            "initialSrc": "https://media.licdn.com/dms/image/v2/C4D03AQH6T2Q_-MO3-w/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1638533606577?e=1782345600\\u0026v=beta\\u0026t=small",
            "assetUrn": "urn:li:digitalmediaAsset:C4D03AQH6T2Q_-MO3-w",
            "artifacts": [
              { "width": 400, "height": 400, "suffixUrl": "400_400/profile-displayphoto-shrink_400_400/0/1638533606577?e=1782345600\\u0026v=beta\\u0026t=medium" },
              { "width": 800, "height": 800, "suffixUrl": "800_800/profile-displayphoto-shrink_800_800/0/1638533606577?e=1782345600\\u0026v=beta\\u0026t=large" }
            ]
          }
        };
      </script>
    `);

    expect(parseProfileImageUrlFromHtml(html, PROFILE_URN)).toBe(
      'https://media.licdn.com/dms/image/v2/C4D03AQH6T2Q_-MO3-w/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1638533606577?e=1782345600&v=beta&t=large'
    );
  });
});

// ── parseStatusFromRegex ───────────────────────────────────────────────────
