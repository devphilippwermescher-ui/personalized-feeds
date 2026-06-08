import type { FeedInfo } from '../types';

interface CreateFeedFormDeps {
  createNewFeed: (name: string) => Promise<boolean>;
  getFeeds: () => FeedInfo[];
}

export function showCreateFeedForm(deps: CreateFeedFormDeps): void {
  const slot = document.getElementById('lfa-create-form-slot');
  if (!slot || slot.children.length > 0) return;

  const form = document.createElement('div');
  form.className = 'lfa-create-form';
  form.innerHTML = `
    <input type="text" class="lfa-create-input" placeholder="Feed name..." id="lfa-create-name" autofocus />
    <button class="lfa-create-ok" id="lfa-create-ok-btn" title="Create">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
    </button>
    <button class="lfa-create-cancel" id="lfa-create-cancel-btn" title="Cancel">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    </button>
  `;
  slot.appendChild(form);

  const input = form.querySelector('#lfa-create-name') as HTMLInputElement | null;
  input?.focus();

  const doCreate = async () => {
    const name = input?.value.trim();
    if (!name) {
      return;
    }

    const created = await deps.createNewFeed(name);
    if (created) {
      form.remove();
      return;
    }

    input?.focus();
    input?.select();
  };

  form.querySelector('#lfa-create-ok-btn')?.addEventListener('click', doCreate);
  form.querySelector('#lfa-create-cancel-btn')?.addEventListener('click', () => form.remove());
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') void doCreate();
    if (e.key === 'Escape') form.remove();
  });
}
