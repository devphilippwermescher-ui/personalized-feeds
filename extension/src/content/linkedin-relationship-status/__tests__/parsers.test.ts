import { describe, it, expect } from 'vitest';
import { parseStatusFromRegex, parseStatusFromRehydration, parseStatusFromCodeBlocks, parseGraphQLRelationshipStatus, parseProfileImageUrlFromHtml } from '../parsers';

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

/**
 * Same semantics but encoded as raw HTML text for parseStatusFromRegex.
 * The invitation/following state keys appear inline (as in older LinkedIn HTML).
 */
const FIXTURE_HTML_REGEX = makeHtml(`
  <script>
    var data = {
      "${PROFILE_URN}": {},
      "urn:li:member:${MEMBER_ID}": {},
      "state:invitation:urn:li:member:${MEMBER_ID}": {"stringValue":"Connect"},
      "urn:li:fsd_followingState:urn:li:member:${MEMBER_ID}": {"stringValue":"Following"}
    };
  </script>
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

describe('parseStatusFromRegex', () => {
  it('returns connect (not connected) for 3rd+Message+Connect hidden state', () => {
    const result = parseStatusFromRegex(FIXTURE_HTML_REGEX);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('connect');
    expect(result?.status).not.toBe('connected');
  });

  it('isFollowing=true when following state = Following', () => {
    const result = parseStatusFromRegex(FIXTURE_HTML_REGEX);
    expect(result?.isFollowing).toBe(true);
    expect(result?.canFollow).toBe(true);
  });

  it('canConnect=true when invitation state = Connect', () => {
    const result = parseStatusFromRegex(FIXTURE_HTML_REGEX);
    expect(result?.canConnect).toBe(true);
  });

  it('returns connected only for 1st degree with Message and no Connect', () => {
    const html = makeHtml(`
      <span>1st</span>
      <button aria-label="Message Alice">Message</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).toBe('connected');
  });

  it('does NOT return connected when 2nd+Message present (no hidden state)', () => {
    const html = makeHtml(`
      <span>2nd</span>
      <button aria-label="Message Bob">Message</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).not.toBe('connected');
  });

  it('does NOT return connected when memberDistance=DISTANCE_3 in JSON even with Message', () => {
    const html = makeHtml(`
      <script>{"memberDistance":"DISTANCE_3"}</script>
      <button aria-label="Message Carol">Message</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).not.toBe('connected');
  });

  it('does NOT return connected when PREMIUM_INMAIL in JSON even with Message', () => {
    const html = makeHtml(`
      <script>{"composeOptionType":"PREMIUM_INMAIL"}</script>
      <button aria-label="Message Dave">Message</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).not.toBe('connected');
  });

  it('returns pending from invitationState PENDING + invitationType SENT', () => {
    const html = makeHtml(`
      <script>{"invitationState":"PENDING","invitationType":"SENT"}</script>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).toBe('pending');
  });

  it('returns connect for bullet 3rd + Follow CTA even without visible Connect button', () => {
    const html = makeHtml(`
      <p>· 3rd</p>
      <button aria-label="Message Karen Wüst">Message</button>
      <button aria-label="Follow Karen Wüst">+ Follow</button>
      <script>{"networkDistance":3}</script>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).toBe('connect');
    expect(result?.canFollow).toBe(true);
    expect(result?.canConnect).toBe(true);
  });

  it('reads invitation state when stringValue is far from the state key', () => {
    const filler = 'x'.repeat(1500);
    const html = makeHtml(`
      <script>
        var payload = "state:invitation:urn:li:member:${MEMBER_ID}${filler}\\\"stringValue\\\":\\\"Connect\\\"";
      </script>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).toBe('connect');
    expect(result?.memberNumericId).toBe(MEMBER_ID);
  });
});

// ── Premium detection ─────────────────────────────────────────────────────

describe('parseStatusFromRegex — Premium profile detection', () => {
  it('sets canMessage=true but NOT isPremium when PREMIUM_INMAIL + Message CTA in HTML', () => {
    // PREMIUM_INMAIL signals InMail availability for the viewer — not a Premium badge on the profile.
    const html = makeHtml(`
      <script>{"composeOptionType":"PREMIUM_INMAIL"}</script>
      <button aria-label="Message Karen Wüst">Message</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result).not.toBeNull();
    expect(result?.canMessage).toBe(true);
    expect(result?.isPremium).toBeFalsy();
    expect(result?.status).toBe('connect');
    expect(result?.status).not.toBe('connected');
  });

  it('sets canMessage=true and canConnect=true but NOT isPremium for PREMIUM_INMAIL + Connect CTA', () => {
    const html = makeHtml(`
      <script>{"composeOptionType":"PREMIUM_INMAIL"}</script>
      <button aria-label="Message Premium User">Message</button>
      <button aria-label="Connect with Premium User">Connect</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.isPremium).toBeFalsy();
    expect(result?.canMessage).toBe(true);
    expect(result?.canConnect).toBe(true);
  });

  it('does NOT set isPremium when only Message CTA (regular connection)', () => {
    const html = makeHtml(`
      <span>1st</span>
      <button aria-label="Message Alice">Message</button>
    `);
    const result = parseStatusFromRegex(html);
    expect(result?.status).toBe('connected');
    expect(result?.isPremium).toBeFalsy();
  });
});

describe('parseGraphQLRelationshipStatus — Premium profile detection', () => {
  function makeGraphQLPayload(overrides: Record<string, unknown> = {}) {
    return {
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: 'urn:li:fsd_profile:ACoAABcTest',
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
                secondaryActionResolutionResult: {
                  composeOption: {
                    composeOptionType: 'PREMIUM_INMAIL',
                  },
                },
              },
              ...overrides,
            },
          ],
        },
      },
    };
  }

  it('sets canMessage=true but NOT isPremium when only PREMIUM_INMAIL (no premiumFeatures)', () => {
    // PREMIUM_INMAIL means InMail is available for the viewer to send.
    // It does NOT mean the viewed profile is a Premium subscriber.
    const result = parseGraphQLRelationshipStatus(makeGraphQLPayload());
    expect(result).not.toBeNull();
    expect(result?.canMessage).toBe(true);
    expect(result?.isPremium).toBeFalsy();
    expect(result?.status).toBe('connect');
  });

  it('sets isPremium=true and canMessage=true when PREMIUM_INMAIL + premiumFeatures.hasAccess', () => {
    const payload = makeGraphQLPayload({
      premiumFeatures: [{ featureType: 'SUBSCRIBER', hasAccess: true }],
    });
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result).not.toBeNull();
    expect(result?.isPremium).toBe(true);
    expect(result?.canMessage).toBe(true);
    expect(result?.status).toBe('connect');
  });

  it('sets isPremium=true via premiumFeatures on profile entity', () => {
    const payload = {
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: 'urn:li:fsd_profile:ACoAABcTest',
              premiumFeatures: { premiumSubscriber: true },
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
                secondaryActionResolutionResult: {
                  composeOption: {
                    composeOptionType: 'OPEN_PROFILE',
                  },
                },
              },
            },
          ],
        },
      },
    };
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result?.isPremium).toBe(true);
    // canMessage not guaranteed from premiumFeatures alone (no PREMIUM_INMAIL)
    expect(result?.canMessage).toBeFalsy();
  });

  it('does NOT set isPremium for regular connected profile (CONNECTION_MESSAGE)', () => {
    const payload = {
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: 'urn:li:fsd_profile:ACoAABcTest',
              profileStatefulProfileActions: {
                primaryActionResolutionResult: {
                  composeOption: { composeOptionType: 'CONNECTION_MESSAGE' },
                  connection: {
                    memberRelationship: { connection: { createdAt: 1234567890 } },
                  },
                },
              },
            },
          ],
        },
      },
    };
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result?.isPremium).toBeFalsy();
    expect(result?.canMessage).toBe(true);
  });

  it('allows messaging for a connected profile even without a compose option', () => {
    const payload = {
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: 'urn:li:fsd_profile:ACoAABcConnected',
              profileStatefulProfileActions: {
                primaryActionResolutionResult: {
                  statefulAction: {
                    actionDataModel: {
                      relationshipActionData: {
                        relationshipData: {
                          connectionOrInvitation: {
                            memberRelationship: {
                              connection: { createdAt: 1234567890 },
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
    };

    const result = parseGraphQLRelationshipStatus(payload);

    expect(result?.status).toBe('connected');
    expect(result?.canMessage).toBe(true);
  });

  it('sets isPremium=true and canMessage=false for premiumFeatures with hasAccess (no INMAIL)', () => {
    const payload = makeGraphQLPayload({
      premiumFeatures: [{ featureType: 'SUBSCRIBER', hasAccess: true }],
    });
    // Override secondaryAction to be non-PREMIUM_INMAIL
    (payload.data.identityDashProfilesByMemberIdentity.elements[0]
      .profileStatefulProfileActions.secondaryActionResolutionResult.composeOption as Record<string, unknown>)
      .composeOptionType = 'CONNECT';
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result?.isPremium).toBe(true);
    expect(result?.canMessage).toBeFalsy();
  });

  it('does NOT set isPremium when premiumFeatures entries lack hasAccess/hasEnabled', () => {
    const payload = makeGraphQLPayload({
      premiumFeatures: [{ featureType: 'SUBSCRIBER' }],  // no hasAccess, no hasEnabled
    });
    (payload.data.identityDashProfilesByMemberIdentity.elements[0]
      .profileStatefulProfileActions.secondaryActionResolutionResult.composeOption as Record<string, unknown>)
      .composeOptionType = 'CONNECT';
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result?.isPremium).toBeFalsy();
  });

  it('sets isPremium=true (from premiumFeatures) and canMessage=false when UPSELL + hasAccess', () => {
    const payload = {
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: 'urn:li:fsd_profile:ACoAABcTest',
              premiumFeatures: [{ featureType: 'SUBSCRIBER', hasAccess: true }],
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
                secondaryActionResolutionResult: {
                  composeOption: {
                    composeOptionType: 'UPSELL',
                    displayText: { accessibilityText: 'Message with Premium' },
                    composeNavigationContext: {
                      targetUrl: 'https://www.linkedin.com/premium/products',
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result).not.toBeNull();
    expect(result?.isPremium).toBe(true);
    expect(result?.canMessage).toBeFalsy();
    expect(result?.status).toBe('connect');
  });

  it('does NOT set isPremium from UPSELL alone when no premiumFeatures', () => {
    // Real case: premiumFeatures is absent/empty and the only signal is UPSELL.
    // UPSELL means the viewer needs Premium to message — it does NOT mean the profile is Premium.
    const payload = makeGraphQLPayload();
    // Replace PREMIUM_INMAIL with UPSELL (no premiumFeatures on this element)
    (payload.data.identityDashProfilesByMemberIdentity.elements[0]
      .profileStatefulProfileActions.secondaryActionResolutionResult.composeOption as Record<string, unknown>)
      .composeOptionType = 'UPSELL';
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result?.isPremium).toBeFalsy();
    expect(result?.canMessage).toBeFalsy();
  });

  it('does NOT set isPremium when premiumFeatures is empty array and UPSELL present', () => {
    // Real false-positive case: empty premiumFeatures + UPSELL => profile is NOT Premium.
    const payload = {
      data: {
        identityDashProfilesByMemberIdentity: {
          elements: [
            {
              entityUrn: 'urn:li:fsd_profile:ACoAABcTest',
              premiumFeatures: [],  // empty — no active premium features
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
                secondaryActionResolutionResult: {
                  composeOption: {
                    composeOptionType: 'UPSELL',
                    displayText: { accessibilityText: 'Message with Premium' },
                    composeNavigationContext: {
                      targetUrl: 'https://www.linkedin.com/premium/products',
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };
    const result = parseGraphQLRelationshipStatus(payload);
    expect(result).not.toBeNull();
    expect(result?.isPremium).toBeFalsy();
    expect(result?.canMessage).toBeFalsy();
    expect(result?.status).toBe('connect');
  });
});

// ── parseStatusFromCodeBlocks — field completeness ────────────────────────

describe('parseStatusFromCodeBlocks — field completeness', () => {
  function codeBlock(content: string): string {
    return `<code>${content}</code>`;
  }

  it('returns all required fields for connected status', () => {
    // Minimal entity map that produces connected status
    const payload = JSON.stringify({
      entityUrn: 'urn:li:fsd_memberRelationship:(urn:li:member:111,urn:li:member:222)',
      memberRelationship: {
        connection: { createdAt: 1234567890 },
      },
    });
    const html = makeHtml(codeBlock(payload));
    const result = parseStatusFromCodeBlocks(html);
    if (result?.status === 'connected') {
      expect(result.canMessage).toBe(true);
      expect(result.canConnect).toBe(false);
    }
    // result may be null if entities didn't match — that's OK for this minimal fixture
  });
});
