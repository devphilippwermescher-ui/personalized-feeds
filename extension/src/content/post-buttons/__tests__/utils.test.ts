import { describe, expect, it } from 'vitest';
import { extractPostAuthorProfile, findPostAuthorDrawerHost, findPostCandidates } from '../utils';

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
    expect(candidates[0].getAttribute('role')).toBe('listitem');
    expect(extractPostAuthorProfile(candidates[0])?.linkedinUsername).toBe('simonsinek');
  });

  it('extracts the SDUI content author after a social context header', () => {
    document.body.innerHTML = `
      <div role="listitem" componentkey="expandedPostFeedType_MAIN_FEED_RELEVANCE">
        <div>
          <a href="https://www.linkedin.com/in/mariana-yurynets-742332198/">
            <img alt="View Mariana Yurynets' profile" src="https://media.licdn.com/mariana.jpg" />
          </a>
          <p><span><a href="https://www.linkedin.com/in/mariana-yurynets-742332198/">Mariana Yurynets</a> likes this</span></p>
        </div>
        <hr role="presentation" />
        <div>
          <a href="https://www.linkedin.com/in/%D1%96%D1%80%D0%B8%D0%BD%D0%B0-%D0%B6%D0%BC%D1%83%D0%B4-19a97a313/">
            <img alt="View Ірина Жмуд's profile" src="https://media.licdn.com/iryna.jpg" />
          </a>
          <div>
            <a href="https://www.linkedin.com/in/%D1%96%D1%80%D0%B8%D0%BD%D0%B0-%D0%B6%D0%BC%D1%83%D0%B4-19a97a313/">
              <div aria-label="Ірина Жмуд  2nd">
                <p><span>Ірина Жмуд</span></p>
                <p><span> • 2nd</span></p>
              </div>
            </a>
          </div>
          <p>Керівник управління роботи з персоналом</p>
          <p><span>2d • <svg aria-label="Visibility: Global"></svg></span></p>
        </div>
        <div data-testid="expandable-text-box">Post content</div>
      </div>
    `;

    const post = document.querySelector<HTMLElement>('[role="listitem"]');

    expect(post).not.toBeNull();
    expect(extractPostAuthorProfile(post!)).toMatchObject({
      linkedinUsername: '%D1%96%D1%80%D0%B8%D0%BD%D0%B0-%D0%B6%D0%BC%D1%83%D0%B4-19a97a313',
      displayName: 'Ірина Жмуд',
      profileImageUrl: 'https://media.licdn.com/iryna.jpg',
    });
    expect(findPostAuthorDrawerHost(post!)?.textContent).toContain('2d');
    expect(findPostAuthorDrawerHost(post!)?.textContent).not.toContain('Ірина Жмуд');
  });

  it('does not use the sharebox composer as a post candidate', () => {
    document.body.innerHTML = `
      <div data-testid="mainFeed" role="list">
        <div data-display-contents="true">
          <div componentkey="shareboxProfilePictureComponentRef">
            <a href="https://www.linkedin.com/in/current-user/"><img src="https://media.licdn.com/me.jpg" /></a>
            <div aria-label="Start a post">Start a post</div>
          </div>
          <div role="listitem" componentkey="expandedPostFeedType_MAIN_FEED_RELEVANCE">
            <a href="https://www.linkedin.com/in/post-author/">
              <div aria-label="Post Author 2nd"><span>Post Author</span><span> • 2nd</span></div>
            </a>
            <p><span>4h • <svg aria-label="Visibility: Global"></svg></span></p>
            <div data-testid="expandable-text-box">Post content</div>
          </div>
        </div>
      </div>
    `;

    const candidates = findPostCandidates(document);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].getAttribute('componentkey')).toContain('FeedType_MAIN_FEED');
    expect(extractPostAuthorProfile(candidates[0])?.linkedinUsername).toBe('post-author');
  });

  it('extracts direct SDUI post authors without a social context header', () => {
    document.body.innerHTML = `
      <div role="listitem" componentkey="expandedPostFeedType_MAIN_FEED_RELEVANCE">
        <a href="https://www.linkedin.com/in/lucamaraschi/">
          <img alt="View Luca M.'s profile" src="https://media.licdn.com/luca.jpg" />
        </a>
        <a href="https://www.linkedin.com/in/lucamaraschi/">
          <div aria-label="Luca M. Premium Profile Following">
            <p><span>Luca M.</span></p>
            <p><span> • Following</span></p>
          </div>
        </a>
        <p>Enterprise AI apps are only as good as their foundation</p>
        <p><span>1d • <svg aria-label="Visibility: Global"></svg></span></p>
        <div data-testid="expandable-text-box">Post content</div>
      </div>
    `;

    const post = document.querySelector<HTMLElement>('[role="listitem"]');

    expect(post).not.toBeNull();
    expect(extractPostAuthorProfile(post!)).toMatchObject({
      linkedinUsername: 'lucamaraschi',
      displayName: 'Luca M.',
      profileImageUrl: 'https://media.licdn.com/luca.jpg',
    });
    expect(findPostAuthorDrawerHost(post!)?.textContent).toContain('1d');
  });

  it('does not place SDUI drawer buttons on the author name when visibility text differs', () => {
    document.body.innerHTML = `
      <div role="listitem" componentkey="expandedPostFeedType_MAIN_FEED_RELEVANCE">
        <a href="https://www.linkedin.com/in/anna-grytsenko/">
          <img alt="View Анна Гриценко's profile" src="https://media.licdn.com/anna.jpg" />
        </a>
        <a href="https://www.linkedin.com/in/anna-grytsenko/">
          <div aria-label="Анна Гриценко 2nd">
            <p><span>Анна Гриценко</span></p>
            <p><span> • 2nd</span></p>
          </div>
        </a>
        <p>People Partner/HR manager/HR ...</p>
        <p><span>5d • <svg id="globe-americas-small" aria-label="Global"></svg></span></p>
        <div data-testid="expandable-text-box">Post content</div>
      </div>
    `;

    const post = document.querySelector<HTMLElement>('[role="listitem"]');
    const host = findPostAuthorDrawerHost(post!);

    expect(host?.textContent).toContain('5d');
    expect(host?.textContent).not.toContain('Анна Гриценко');
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
