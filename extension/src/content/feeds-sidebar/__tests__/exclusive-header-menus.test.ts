import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSidebarDom } from '../logic/dom-bindings';

describe('sidebar header menus', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="sidebar-test-root">
        <button id="lfa-settings-btn" type="button">Settings</button>
        <div id="lfa-settings-menu"></div>
        <button id="lfa-account-btn" type="button">Account</button>
        <div id="lfa-account-menu"></div>
      </div>
    `;
  });

  it('keeps the feature settings and account menus mutually exclusive', () => {
    const container = document.querySelector<HTMLElement>('#sidebar-test-root');
    if (!container) throw new Error('Test container is missing');

    const stub = vi.fn();
    const deps = new Proxy(
      { memberActionDeps: {} },
      { get: (target, key) => Reflect.get(target, key) ?? stub }
    ) as unknown as Parameters<typeof bindSidebarDom>[1];

    bindSidebarDom(container, deps);

    container.querySelector<HTMLButtonElement>('#lfa-settings-btn')?.click();
    expect(container.querySelector('#lfa-settings-menu')?.classList.contains('lfa-settings-menu--open')).toBe(true);

    container.querySelector<HTMLButtonElement>('#lfa-account-btn')?.click();
    expect(container.querySelector('#lfa-settings-menu')?.classList.contains('lfa-settings-menu--open')).toBe(false);
    expect(container.querySelector('#lfa-account-menu')?.classList.contains('lfa-account-menu--open')).toBe(true);

    container.querySelector<HTMLButtonElement>('#lfa-settings-btn')?.click();
    expect(container.querySelector('#lfa-account-menu')?.classList.contains('lfa-account-menu--open')).toBe(false);
    expect(container.querySelector('#lfa-settings-menu')?.classList.contains('lfa-settings-menu--open')).toBe(true);
  });
});
