import { describe, expect, it } from 'vitest';
import { parseProfileViewersFromPayload } from '../profile-viewers-payload-parser';

interface TestCard {
  username: string;
  displayName: string;
  headline?: string;
  viewedAgoText?: string;
  connectionDegree?: string;
  verticalPosition?: number;
  mutualConnectionsText?: string;
  premium?: boolean;
  endpointPremiumMetadata?: boolean;
  imageRootUrl?: string;
  imageSuffixUrl?: string;
}

function createRscPayload(cards: TestCard[]): string {
  const records = cards.map((card, index) => {
    const id = (index + 1).toString(16);
    const children: unknown[] = [
      { navigationUrl: `https://www.linkedin.com/in/${card.username}/` },
      { children: [null, card.displayName] },
      { children: [card.connectionDegree ? `• ${card.connectionDegree}` : '', card.headline || ''] },
      { children: [card.viewedAgoText || 'Viewed 1h ago', card.mutualConnectionsText || ''] },
    ];
    if (card.verticalPosition !== undefined) {
      children.push({
        $type: 'proto.sdui.common.SemanticPosition',
        verticalPosition: card.verticalPosition,
      });
    }
    if (card.imageRootUrl && card.imageSuffixUrl) {
      children.push({
        a11yText: card.displayName,
        shape: 'circle',
        renderPayload: {
          rootUrl: card.imageRootUrl,
          imageRenditions: [{ width: 100, height: 100, suffixUrl: card.imageSuffixUrl }],
          assetUrn: `urn:li:digitalmediaAsset:${id}`,
        },
      });
    }
    if (card.premium) {
      children.push({ premiumFeatures: [{ featureType: 'SUBSCRIBER', hasAccess: true }] });
    }
    if (card.endpointPremiumMetadata) {
      children.push({
        pagerId: 'com.linkedin.sdui.premium.wvmp.entityList',
        requestId: 'WvmpEntityList',
      });
    }
    return `${id}:${JSON.stringify(['$', 'div', null, { children }])}`;
  });
  records.push(
    `0:${JSON.stringify([
      '$',
      'main',
      null,
      { children: cards.map((_card, index) => `$L${(index + 1).toString(16)}`) },
    ])}`
  );
  return records.join('\n');
}

describe('parseProfileViewersFromPayload', () => {
  it('returns blank-time viewers in React render order instead of definition order', () => {
    const payload = [
      'a:["$","div",null,{"children":["https://www.linkedin.com/in/yurii-klymchuk-it/","Yurii Klymchuk"]}]',
      'b:["$","div",null,{"children":["https://www.linkedin.com/in/oleksandr-alieksandrov/","Oleksandr Aleksandrov"]}]',
      '0:["$","div",null,{"children":["$Lb","$La"]}]',
    ].join('\n');

    const viewers = parseProfileViewersFromPayload(payload);

    expect(viewers.map((viewer) => viewer.linkedinUsername)).toEqual([
      'oleksandr-alieksandrov',
      'yurii-klymchuk-it',
    ]);
    expect(viewers.map((viewer) => viewer.sourceIndex)).toEqual([0, 1]);
    expect(viewers.every((viewer) => viewer.identityUncertain)).toBe(true);
  });

  it('extracts named viewers from a partial pagination RSC graph', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'mariia-recruitment',
          displayName: 'Mariia Zaichuk',
          headline: 'IT Recruiter at Talentin',
          viewedAgoText: 'Viewed 1w ago',
        },
      ])
    );

    expect(viewers).toEqual([
      expect.objectContaining({
        linkedinUsername: 'mariia-recruitment',
        linkedinUrl: 'https://www.linkedin.com/in/mariia-recruitment/',
        displayName: 'Mariia Zaichuk',
        headline: 'IT Recruiter at Talentin',
        viewedAgoText: 'Viewed 1w ago',
        identityUncertain: false,
      }),
    ]);
  });

  it('extracts LinkedIn semantic positions from each rendered card context', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'nadira-sultankulova',
          displayName: 'Nadira Sultankulova',
          viewedAgoText: 'Viewed 1mo ago',
          verticalPosition: 26,
        },
        {
          username: 'kamalakar-vatala',
          displayName: 'Kamalakar Vatala',
          viewedAgoText: 'Viewed 1mo ago',
          verticalPosition: 25,
        },
      ])
    );

    expect(
      viewers.map((viewer) => ({
        username: viewer.linkedinUsername,
        renderPosition: viewer.renderPosition,
      }))
    ).toEqual([
      { username: 'nadira-sultankulova', renderPosition: 26 },
      { username: 'kamalakar-vatala', renderPosition: 25 },
    ]);
  });

  it('keeps the display name scoped to the current LinkedIn card', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'dima-lavrov',
          displayName: 'Dima Lavrov',
          viewedAgoText: 'Viewed 1h ago',
        },
        {
          username: 'alia-waleczek-806248315',
          displayName: 'Alia Waleczek',
          headline: 'Student at Davenport University',
          viewedAgoText: 'Viewed 3h ago',
        },
      ])
    );

    expect(viewers.find((viewer) => viewer.linkedinUsername === 'alia-waleczek-806248315')).toEqual(
      expect.objectContaining({
        displayName: 'Alia Waleczek',
        headline: 'Student at Davenport University',
        viewedAgoText: 'Viewed 3h ago',
      })
    );
  });

  it('retains same-card data but requires exact verification for an opaque vanity slug', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'alexandrushka',
          displayName: 'Alexandra Mitskevich',
          headline: 'IT Talent Scout / IT Recruiter at ZNOJDZIEM',
          connectionDegree: '2nd',
          viewedAgoText: 'Viewed 2d ago',
          imageRootUrl: 'https://media.licdn.com/dms/image/v2/D4D03AQ/profile-displayphoto-scale_',
          imageSuffixUrl: '100_100/test.jpg',
        },
      ])
    );

    expect(viewers).toEqual([
      expect.objectContaining({
        linkedinUsername: 'alexandrushka',
        displayName: 'Alexandra Mitskevich',
        headline: 'IT Talent Scout / IT Recruiter at ZNOJDZIEM',
        connectionDegree: '2nd',
        viewedAgoText: 'Viewed 2d ago',
        profileImageUrl: '',
        identityUncertain: true,
      }),
    ]);
  });

  it('keeps short role headlines instead of RSC boolean fragments', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'maksym-krapivnoy-a50870164',
          displayName: 'Maksym Krapivnoy',
          headline: 'Recruiter',
          connectionDegree: '1st',
          viewedAgoText: 'Viewed 2w ago',
        },
      ])
    );

    expect(viewers[0]).toEqual(
      expect.objectContaining({ headline: 'Recruiter', connectionDegree: '1st' })
    );
  });

  it('extracts only a card-local premium badge signal', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'yevhen-romanenko',
          displayName: 'Yevhen Romanenko',
          premium: true,
        },
        {
          username: 'regular-viewer',
          displayName: 'Regular Viewer',
          endpointPremiumMetadata: true,
        },
      ])
    );

    expect(viewers.find((viewer) => viewer.linkedinUsername === 'yevhen-romanenko')?.isPremium).toBe(true);
    expect(viewers.find((viewer) => viewer.linkedinUsername === 'regular-viewer')?.isPremium).toBeUndefined();
  });

  it('does not attach a conflicting same-context name or fields to a vanity URL', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'carmen-linzner',
          displayName: 'Niels Wennesheimer',
          headline: 'Neighbour headline',
          viewedAgoText: 'Viewed 1h ago',
        },
        {
          username: 'niels-wennesheimer',
          displayName: 'Niels Wennesheimer',
          viewedAgoText: 'Viewed 2h ago',
        },
      ])
    );
    const carmen = viewers.find((viewer) => viewer.linkedinUsername === 'carmen-linzner');

    expect(carmen).toEqual(
      expect.objectContaining({
        displayName: 'Carmen Linzner',
        headline: '',
        viewedAgoText: '',
        identityUncertain: true,
      })
    );
  });

  it('refuses an avatar from a conflicting card identity', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'julia-mozharova',
          displayName: 'Adam Ivaniush',
          headline: 'Backend Developer',
          imageRootUrl: 'https://media.licdn.com/dms/image/v2/adam/profile-displayphoto-shrink_',
          imageSuffixUrl: '100_100/photo',
        },
      ])
    );

    expect(viewers[0]).toEqual(
      expect.objectContaining({
        linkedinUsername: 'julia-mozharova',
        displayName: 'Julia Mozharova',
        profileImageUrl: '',
        identityUncertain: true,
      })
    );
  });

  it('requires exact verification for an opaque LinkedIn member token', () => {
    const viewers = parseProfileViewersFromPayload(
      createRscPayload([
        {
          username: 'ACoAAVeryOpaqueMemberToken123',
          displayName: 'Alina Diachenko',
          headline: 'Back-end Developer',
        },
      ])
    );

    expect(viewers[0]).toEqual(
      expect.objectContaining({
        linkedinUsername: 'acoaaveryopaquemembertoken123',
        displayName: 'Alina Diachenko',
        profileImageUrl: '',
        identityUncertain: true,
      })
    );
  });
});
