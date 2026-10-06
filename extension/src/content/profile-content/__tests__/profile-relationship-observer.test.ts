import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProfileRelationshipObserver } from '../controllers/profile-relationship-observer';

function createTopCard(action: 'Connect' | 'Pending' = 'Connect'): HTMLElement {
  const root = document.createElement('section');
  root.className = 'pv-top-card';
  root.innerHTML = `
    <h1>Yuliia Biliavtseva</h1>
    <span class="dist-value">2nd</span>
    <button aria-label="${action}">${action}</button>
  `;
  document.body.append(root);
  return root;
}

async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

describe('profile relationship observer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses each profile open as a baseline without requesting verification', async () => {
    const onRelationshipChanged = vi.fn();
    const observer = createProfileRelationshipObserver({ debounceMs: 100, onRelationshipChanged });

    const firstRoot = createTopCard();
    observer.observe(firstRoot);
    await vi.runAllTimersAsync();

    firstRoot.remove();
    const reopenedRoot = createTopCard();
    observer.observe(reopenedRoot);
    await vi.runAllTimersAsync();

    expect(onRelationshipChanged).not.toHaveBeenCalled();
    observer.disconnect();
  });

  it('debounces a real relationship change into one verification', async () => {
    const onRelationshipChanged = vi.fn();
    const observer = createProfileRelationshipObserver({ debounceMs: 100, onRelationshipChanged });
    const root = createTopCard();
    observer.observe(root);

    const action = root.querySelector('button');
    if (!action) throw new Error('Expected relationship action');
    action.click();
    action.textContent = 'Pending';
    action.setAttribute('aria-label', 'Pending, click to withdraw invitation');
    action.classList.add('artdeco-button--muted');
    await flushMutations();

    await vi.advanceTimersByTimeAsync(99);
    expect(onRelationshipChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onRelationshipChanged).toHaveBeenCalledOnce();

    action.textContent = 'Connect';
    action.setAttribute('aria-label', 'Invite Yuliia to connect');
    await flushMutations();
    await vi.runAllTimersAsync();
    expect(onRelationshipChanged).toHaveBeenCalledOnce();
    observer.disconnect();
  });

  it('treats late LinkedIn hydration and scroll-driven replacement as baseline updates', async () => {
    const onRelationshipChanged = vi.fn();
    const observer = createProfileRelationshipObserver({ debounceMs: 100, onRelationshipChanged });
    const root = document.createElement('section');
    root.className = 'pv-top-card';
    root.innerHTML = '<h1>Yuliia Biliavtseva</h1><span class="dist-value">2nd</span>';
    document.body.append(root);
    observer.observe(root);

    root.insertAdjacentHTML('beforeend', '<button aria-label="Invite Yuliia to connect">Connect</button>');
    await flushMutations();
    await vi.runAllTimersAsync();

    root.querySelector('button')?.remove();
    await flushMutations();
    await vi.runAllTimersAsync();

    expect(onRelationshipChanged).not.toHaveBeenCalled();
    observer.disconnect();
  });

  it('does not arm verification from relationship buttons outside the current profile surfaces', async () => {
    const onRelationshipChanged = vi.fn();
    const observer = createProfileRelationshipObserver({ debounceMs: 100, onRelationshipChanged });
    const root = createTopCard();
    observer.observe(root);

    const suggestion = document.createElement('aside');
    suggestion.innerHTML = '<button aria-label="Invite Suggested Person to connect">Connect</button>';
    document.body.append(suggestion);
    suggestion.querySelector('button')?.click();

    const action = root.querySelector('button');
    if (!action) throw new Error('Expected relationship action');
    action.textContent = 'Pending';
    action.setAttribute('aria-label', 'Pending, click to withdraw invitation');
    await flushMutations();
    await vi.runAllTimersAsync();

    expect(onRelationshipChanged).not.toHaveBeenCalled();
    observer.disconnect();
  });

  it('ignores hidden and extension-owned relationship labels', async () => {
    const onRelationshipChanged = vi.fn();
    const observer = createProfileRelationshipObserver({ debounceMs: 100, onRelationshipChanged });
    const root = createTopCard();
    observer.observe(root);

    root.insertAdjacentHTML(
      'beforeend',
      `
        <button hidden aria-label="Pending, click to withdraw invitation">Pending</button>
        <div data-pf-feed-card="true"><button aria-label="Pending">Pending</button></div>
      `
    );
    await flushMutations();
    await vi.runAllTimersAsync();

    expect(onRelationshipChanged).not.toHaveBeenCalled();
    observer.disconnect();
  });
});
