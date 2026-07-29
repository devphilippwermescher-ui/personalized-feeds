import { describe, expect, it } from 'vitest';
import { parseProfileViewersFromPayload } from '../profile-viewers-payload-parser';

describe('parseProfileViewersFromPayload', () => {
  it('extracts named viewers from a partial pagination payload', () => {
    const payload = [
      '"url":"https://www.linkedin.com/in/mariia-recruitment/"',
      '"children":[[null,"Mariia Zaichuk"',
      '"children":["IT Recruiter at Talentin"]',
      '"children":["Viewed 1w ago"]',
      '"a11yText":"Mariia Zaichuk","shape":"circle"',
    ].join(',');

    expect(parseProfileViewersFromPayload(payload)).toEqual([
      expect.objectContaining({
        linkedinUsername: 'mariia-recruitment',
        linkedinUrl: 'https://www.linkedin.com/in/mariia-recruitment/',
        displayName: 'Mariia Zaichuk',
        headline: 'IT Recruiter at Talentin',
        viewedAgoText: 'Viewed 1w ago',
      }),
    ]);
  });

  it('keeps the display name scoped to the current LinkedIn profile reference', () => {
    const payload = [
      '"children":["Dima Lavrov"]',
      '"url":"https://www.linkedin.com/in/dima-lavrov/"',
      '"children":["Viewed 1h ago"]',
      '"url":"https://www.linkedin.com/in/alia-waleczek-806248315/"',
      '"children":[[null,"Alia Waleczek"',
      '"children":["Student at Davenport University"]',
      '"children":["Viewed 3h ago"]',
      '"a11yText":"Alia Waleczek","shape":"circle"',
    ].join(',');

    const viewers = parseProfileViewersFromPayload(payload);

    expect(viewers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkedinUsername: 'alia-waleczek-806248315',
          linkedinUrl: 'https://www.linkedin.com/in/alia-waleczek-806248315/',
          displayName: 'Alia Waleczek',
          headline: 'Student at Davenport University',
          viewedAgoText: 'Viewed 3h ago',
        }),
      ])
    );
    expect(
      viewers.find((viewer) => viewer.linkedinUsername === 'alia-waleczek-806248315')?.displayName
    ).not.toBe('Dima Lavrov');
  });

  it('uses the visible card name when the profile slug does not match it', () => {
    const payload = [
      '"url":"https://www.linkedin.com/in/alexandrushka/"',
      '"children":[[null,"Alexandra Mitskevich"',
      '"children":["• 2nd"]',
      '"children":["IT Talent Scout / IT Recruiter at ZNOJDZIEM"]',
      '"children":["Viewed 2d ago"]',
      '"a11yText":"Alexandra Mitskevich","shape":"circle","renderPayload":{"rootUrl":"https://media.licdn.com/dms/image/v2/D4D03AQ/profile-displayphoto-","imageRenditions":[{"width":100,"height":100,"suffixUrl":"scale_100_100/test.jpg"}],"assetUrn":"urn:li:digitalmediaAsset:test"}',
    ].join(',');

    expect(parseProfileViewersFromPayload(payload)).toEqual([
      expect.objectContaining({
        linkedinUsername: 'alexandrushka',
        displayName: 'Alexandra Mitskevich',
        headline: 'IT Talent Scout / IT Recruiter at ZNOJDZIEM',
        connectionDegree: '2nd',
        viewedAgoText: 'Viewed 2d ago',
        profileImageUrl: 'https://media.licdn.com/dms/image/v2/D4D03AQ/profile-displayphoto-scale_100_100/test.jpg',
      }),
    ]);
  });

  it('keeps short role headlines instead of RSC boolean fragments', () => {
    const payload = [
      '"url":"https://www.linkedin.com/in/maksym-krapivnoy-a50870164/"',
      '"children":[[null,"Maksym Krapivnoy"',
      '"children":["• 1st"]',
      '"children":["Recruiter"]',
      '":false,"',
      '"children":["Viewed 2w ago"]',
    ].join(',');

    expect(parseProfileViewersFromPayload(payload)).toEqual([
      expect.objectContaining({
        linkedinUsername: 'maksym-krapivnoy-a50870164',
        displayName: 'Maksym Krapivnoy',
        headline: 'Recruiter',
        connectionDegree: '1st',
        viewedAgoText: 'Viewed 2w ago',
      }),
    ]);
  });

  it('extracts a premium badge signal scoped to the current viewer', () => {
    const payload = [
      '"url":"https://www.linkedin.com/in/yevhen-romanenko/"',
      '"children":[[null,"Yevhen Romanenko"',
      '"children":["Senior/Lead Frontend Engineer"]',
      '"premiumFeatures":[{"featureType":"SUBSCRIBER","hasAccess":true}]',
      '"url":"https://www.linkedin.com/in/regular-viewer/"',
      '"children":[[null,"Regular Viewer"',
      '"children":["Product Manager"]',
    ].join(',');

    const viewers = parseProfileViewersFromPayload(payload);

    expect(viewers.find((viewer) => viewer.linkedinUsername === 'yevhen-romanenko')).toEqual(
      expect.objectContaining({
        displayName: 'Yevhen Romanenko',
        isPremium: true,
      })
    );
    expect(viewers.find((viewer) => viewer.linkedinUsername === 'regular-viewer')?.isPremium).toBeUndefined();
  });

  it('does not treat Profile Visitors premium endpoint metadata as a profile premium badge', () => {
    const payload = [
      '"url":"https://www.linkedin.com/in/regular-viewer/"',
      '"children":[[null,"Regular Viewer"',
      '"children":["Product Manager"]',
      '"pagerId":"com.linkedin.sdui.premium.wvmp.entityList"',
      '"requestId":"WvmpEntityList"',
    ].join(',');

    expect(parseProfileViewersFromPayload(payload)).toEqual([
      expect.objectContaining({
        linkedinUsername: 'regular-viewer',
        displayName: 'Regular Viewer',
        isPremium: undefined,
      }),
    ]);
  });

  it('does not attach another viewer name to a name-like profile slug', () => {
    const payload = [
      '"url":"https://www.linkedin.com/in/carmen-linzner/"',
      '"children":[[null,"Niels Wennesheimer"',
      '"children":["Viewed 1h ago"]',
      '"url":"https://www.linkedin.com/in/niels-wennesheimer/"',
      '"children":[[null,"Niels Wennesheimer"',
      '"children":["Viewed 2h ago"]',
    ].join(',');

    const viewers = parseProfileViewersFromPayload(payload);

    expect(viewers.find((viewer) => viewer.linkedinUsername === 'carmen-linzner')).toEqual(
      expect.objectContaining({
        displayName: 'Carmen Linzner',
        linkedinUrl: 'https://www.linkedin.com/in/carmen-linzner/',
      })
    );
    expect(viewers.find((viewer) => viewer.linkedinUsername === 'niels-wennesheimer')).toEqual(
      expect.objectContaining({
        displayName: 'Niels Wennesheimer',
        linkedinUrl: 'https://www.linkedin.com/in/niels-wennesheimer/',
      })
    );
  });
});
