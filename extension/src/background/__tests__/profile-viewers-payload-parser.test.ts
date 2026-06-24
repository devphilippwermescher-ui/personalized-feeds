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
});
