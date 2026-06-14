import { describe, expect, it } from 'vitest';
import { extractPrivateProfileViewerCount } from '../profile-viewer-private-count';

describe('extractPrivateProfileViewerCount', () => {
  it('extracts the private viewer count from localized LinkedIn HTML', () => {
    const payload = `
      <div>
        <p>Учасники LinkedIn (4)</p>
        <p>Ці люди переглядали профіль у конфіденційному режимі</p>
        <a href="https://www.linkedin.com/help/linkedin/answer/a567226/">Дізнатися більше</a>
      </div>
    `;

    expect(extractPrivateProfileViewerCount(payload)).toBe(4);
  });

  it('supports escaped RSC payload links and English labels', () => {
    const payload =
      '"LinkedIn members (58)" "https:\\/\\/www.linkedin.com\\/help\\/linkedin\\/answer\\/a567226\\/"';

    expect(extractPrivateProfileViewerCount(payload)).toBe(58);
  });

  it('supports LinkedIn RSC components between the label, count, and help link', () => {
    const payload = `
      "children":["LinkedIn members",["$","span",null,{"children":" "}],"\\u00284\\u0029"]
      ${'{"componentKey":"viewer-list-item","props":{"children":[]}},'.repeat(40)}
      "url":"https:\\/\\/www.linkedin.com\\/help\\/linkedin\\/answer\\/a567226\\/"
    `;

    expect(extractPrivateProfileViewerCount(payload)).toBe(4);
  });

  it('does not infer private viewers without the stable help article marker', () => {
    expect(extractPrivateProfileViewerCount('LinkedIn members (14)')).toBeNull();
  });
});
