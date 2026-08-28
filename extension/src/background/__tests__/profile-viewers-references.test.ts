import { describe, expect, it } from 'vitest';
import { INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE } from '../features/profile-viewers/testing/interleaved-profile-viewers-rsc';
import { extractProfileViewerReferences } from '../profile-viewers-references';

describe('extractProfileViewerReferences', () => {
  it('returns only profile references reached through rendered card contexts', () => {
    const references = extractProfileViewerReferences(
      INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE
    );

    expect(references.slice(0, 3).map((reference) => reference.linkedinUsername)).toEqual([
      'rossor',
      'kamalakar-vatala',
      'nadira-sultankulova',
    ]);
    expect(references.map((reference) => reference.linkedinUsername)).not.toContain(
      'volodymyr-korol'
    );
  });

  it('unwraps an SSE envelope before traversing the rendered graph', () => {
    const payload = `data: ${JSON.stringify({
      type: 'message',
      data: INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE,
    })}`;

    expect(extractProfileViewerReferences(payload)[0]?.linkedinUsername).toBe('rossor');
  });
});
