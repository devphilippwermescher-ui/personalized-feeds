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

  it('opens billing for Manage plan and pricing for Get Pro', () => {
    document.body.innerHTML = `
      <div id="sidebar-test-root">
        <div id="lfa-account-menu" class="lfa-account-menu--open"></div>
        <button id="lfa-manage-plan-btn" data-plan-action="portal" type="button">Manage plan</button>
        <button id="lfa-footer-get-pro-btn" type="button">Get Pro</button>
      </div>
    `;
    const container = document.querySelector<HTMLElement>('#sidebar-test-root');
    if (!container) throw new Error('Test container is missing');

    const openCustomerPortal = vi.fn();
    const openPricingPage = vi.fn();
    const stub = vi.fn();
    const deps = new Proxy(
      { memberActionDeps: {}, openCustomerPortal, openPricingPage },
      { get: (target, key) => Reflect.get(target, key) ?? stub }
    ) as unknown as Parameters<typeof bindSidebarDom>[1];

    bindSidebarDom(container, deps);
    container.querySelector<HTMLButtonElement>('#lfa-manage-plan-btn')?.click();
    container.querySelector<HTMLButtonElement>('#lfa-footer-get-pro-btn')?.click();

    expect(openCustomerPortal).toHaveBeenCalledOnce();
    expect(openPricingPage).toHaveBeenCalledOnce();
    expect(container.querySelector('#lfa-account-menu')?.classList.contains('lfa-account-menu--open')).toBe(false);
  });

  it('opens pricing from Manage plan for a Free account', () => {
    document.body.innerHTML = `
      <div id="sidebar-test-root">
        <div id="lfa-account-menu" class="lfa-account-menu--open"></div>
        <button id="lfa-manage-plan-btn" data-plan-action="pricing" type="button">Manage plan</button>
      </div>
    `;
    const container = document.querySelector<HTMLElement>('#sidebar-test-root');
    if (!container) throw new Error('Test container is missing');

    const openCustomerPortal = vi.fn();
    const openPricingPage = vi.fn();
    const stub = vi.fn();
    const deps = new Proxy(
      { memberActionDeps: {}, openCustomerPortal, openPricingPage },
      { get: (target, key) => Reflect.get(target, key) ?? stub }
    ) as unknown as Parameters<typeof bindSidebarDom>[1];

    bindSidebarDom(container, deps);
    container.querySelector<HTMLButtonElement>('#lfa-manage-plan-btn')?.click();

    expect(openCustomerPortal).not.toHaveBeenCalled();
    expect(openPricingPage).toHaveBeenCalledOnce();
  });
});
