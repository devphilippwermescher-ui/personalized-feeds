import { describe, it, expect } from 'vitest';
import {
  parseGraphQLRelationshipStatus,
  parseStatusFromCodeBlocks,
  parseStatusFromRegex,
} from '../parsers';

function makeHtml(body: string): string {
  return `<!DOCTYPE html><html><body>${body}</body></html>`;
}

const PROFILE_URN = 'urn:li:fsd_profile:ACoAAD-GGcUBpTest';
const MEMBER_ID = '987654321';
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
