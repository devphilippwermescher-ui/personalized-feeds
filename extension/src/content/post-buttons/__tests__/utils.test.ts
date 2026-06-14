import { describe, expect, it } from 'vitest';
import { extractPostAuthorProfile, findPostCandidates } from '../utils';

function makePost(html: string): HTMLElement {
  const post = document.createElement('article');
  post.className = 'feed-shared-update-v2';
  post.setAttribute('data-urn', 'urn:li:activity:123');
  post.innerHTML = html;
  document.body.appendChild(post);
  return post;
}

describe('extractPostAuthorProfile', () => {
  it('extracts the content author instead of the earlier social-action actor', () => {
    const post = makePost(`
      <div class="update-components-header">
        <a href="https://www.linkedin.com/in/milan-jovanovic/" data-test-app-aware-link>
          <img class="EntityPhoto-circle-3" src="https://media.licdn.com/milan.jpg" />
          Milan Jovanovic likes this
        </a>
      </div>
      <div class="update-components-actor">
        <a class="update-components-actor__image" href="https://www.linkedin.com/in/neokim/">
          <img class="update-components-actor__avatar-image" src="https://media.licdn.com/neo.jpg" />
        </a>
        <a class="update-components-actor__meta-link" href="https://www.linkedin.com/in/neokim/">
          <span class="update-components-actor__title">
            <span aria-hidden="true">Neo Kim</span>
          </span>
          <span class="update-components-actor__description">
            <span aria-hidden="true">I Teach You AI & System Design</span>
          </span>
        </a>
      </div>
    `);

    expect(extractPostAuthorProfile(post)).toMatchObject({
      linkedinUrl: 'https://www.linkedin.com/in/neokim/',
      linkedinUsername: 'neokim',
      displayName: 'Neo Kim',
      headline: 'I Teach You AI & System Design',
      profileImageUrl: 'https://media.licdn.com/neo.jpg',
      postUrn: 'urn:li:activity:123',
    });
  });

  it('supports generic profile links when they are scoped to the actor block', () => {
    const post = makePost(`
      <div class="update-components-header">
        <a href="https://www.linkedin.com/in/social-actor/" data-test-app-aware-link>
          Social Actor reposted this
        </a>
      </div>
      <div class="feed-shared-actor">
        <a href="https://www.linkedin.com/in/original-author/" data-test-app-aware-link>
          <span class="update-components-actor__title">Original Author</span>
        </a>
        <img class="feed-shared-actor__avatar-image" src="https://media.licdn.com/original.jpg" />
        <div class="update-components-actor__description">Software Engineer</div>
      </div>
    `);

    expect(extractPostAuthorProfile(post)).toMatchObject({
      linkedinUsername: 'original-author',
      displayName: 'Original Author',
      profileImageUrl: 'https://media.licdn.com/original.jpg',
    });
  });

  it('does not fall back to a liker when the content author cannot be resolved', () => {
    const post = makePost(`
      <div class="update-components-header">
        <a href="https://www.linkedin.com/in/social-actor/" data-test-app-aware-link>
          Social Actor likes this
        </a>
      </div>
      <div class="update-components-text">Post content without an actor block</div>
    `);

    expect(extractPostAuthorProfile(post)).toBeNull();
  });

  it('discovers modern SDUI feed cards without the legacy post class', () => {
    document.body.innerHTML = `
      <div data-testid="mainFeed" role="list">
        <div class="hashed-wrapper">
          <div role="listitem" componentkey="expandedPostFeedType_MAIN_FEED_RELEVANCE">
            <a aria-label="View Simon Sinek profile" href="https://www.linkedin.com/in/simonsinek/">
              <span class="feed-shared-actor__name">Simon Sinek</span>
            </a>
            <div data-testid="expandable-text-box">Post content</div>
          </div>
        </div>
      </div>
    `;

    const candidates = findPostCandidates(document);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].classList.contains('hashed-wrapper')).toBe(true);
    expect(extractPostAuthorProfile(candidates[0])?.linkedinUsername).toBe('simonsinek');
  });

  it('does not discover unrelated list items outside the main feed', () => {
    document.body.innerHTML = `
      <div role="list">
        <div role="listitem" componentkey="expandedPostFeedType_MAIN_FEED_RELEVANCE">
          <a aria-label="View Person profile" href="https://www.linkedin.com/in/person/">Person</a>
        </div>
      </div>
    `;

    expect(findPostCandidates(document)).toEqual([]);
  });
});
