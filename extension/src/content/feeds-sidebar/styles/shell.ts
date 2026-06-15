export const SHELL_CSS = `
  .lfa-trigger-btn {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    border: 1.5px solid rgba(97, 93, 236, 0.32);
    border-right: none;
    border-radius: 14px 0 0 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 99998;
    box-shadow:
      -8px 10px 22px rgba(15, 23, 42, 0.10),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
    transition: transform 0.2s, opacity 0.2s, box-shadow 0.2s, border-color 0.2s, background 0.2s;
  }
  .lfa-trigger-btn:hover {
    border-color: rgba(97, 93, 236, 0.5);
    background: linear-gradient(180deg, #ffffff 0%, #f3f6ff 100%);
    box-shadow:
      -10px 14px 26px rgba(97, 93, 236, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.98);
  }
  .lfa-trigger-btn img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    display: block;
  }
  .lfa-trigger-hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%) translateX(50px);
  }

  .lfa-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 500px;
    height: 100vh;
    background: #fff;
    box-shadow: -4px 0 20px rgba(0,0,0,0.12);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #333;
  }
  .lfa-sidebar-open {
    transform: translateX(0);
  }

  .lfa-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .lfa-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lfa-header-title {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a2e;
  }
  .lfa-header-logo img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
  }
  .lfa-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lfa-header-right .lfa-header-control {
    appearance: none !important;
    -webkit-appearance: none !important;
    line-height: 1 !important;
    text-transform: none !important;
    letter-spacing: normal !important;
    box-sizing: border-box !important;
    flex: 0 0 auto !important;
    margin: 0 !important;
    text-decoration: none !important;
  }
  .lfa-header-dashboard-btn {
    border: none;
    background: linear-gradient(180deg, #ff8a21 0%, #ff6f0f 100%);
    color: #ffffff;
    border-radius: 8px;
    padding: 0 18px;
    height: 28px;
    min-height: 28px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    letter-spacing: normal;
    cursor: pointer;
    box-shadow:
      0 12px 24px rgba(249, 115, 22, 0.28),
      inset 0 1px 0 rgba(255, 255, 255, 0.22);
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  .lfa-header-dashboard-btn:hover {
    filter: saturate(1.03);
    box-shadow:
      0 14px 28px rgba(249, 115, 22, 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
  }
  .lfa-header-dashboard-btn:focus-visible {
    outline: 3px solid rgba(255, 138, 33, 0.26);
    outline-offset: 3px;
  }
  .lfa-plan-toggle-btn {
    border-radius: 8px;
    padding: 0 10px;
    height: 28px;
    min-height: 28px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    cursor: pointer;
    transition: filter 0.15s ease;
  }
  .lfa-plan-toggle-btn--free {
    border: 1.5px solid #d1d5db;
    background: #f9fafb;
    color: #6b7280;
  }
  .lfa-plan-toggle-btn--free:hover {
    filter: brightness(0.96);
  }
  .lfa-plan-toggle-btn--pro {
    border: none;
    background: linear-gradient(135deg, #615DEC 0%, #8b5cf6 100%);
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(97, 93, 236, 0.35);
  }
  .lfa-plan-toggle-btn--pro:hover {
    filter: brightness(1.08);
  }
  .lfa-account-menu-wrap,
  .lfa-settings-menu-wrap {
    position: relative;
  }
  .lfa-header-avatar-btn {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    border-radius: 999px;
    transition: transform 0.16s ease;
    width: 24px;
    height: 24px;
  }
  .lfa-header-avatar-btn:hover {
  }
  .lfa-header-avatar-btn:focus-visible {
    outline: 2px solid rgba(97, 93, 236, 0.35);
    outline-offset: 3px;
  }
  .lfa-settings-btn {
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    border-radius: 8px;
    border: 1px solid #dbe3f0;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    color: #374151;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  }
  .lfa-settings-btn svg {
    width: 15px;
    height: 15px;
  }
  .lfa-settings-btn:hover {
    border-color: rgba(97, 93, 236, 0.35);
    color: #615DEC;
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  }
  .lfa-settings-menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: 286px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 24px 44px rgba(15, 23, 42, 0.14);
    z-index: 40;
    display: none;
  }
  .lfa-account-menu {
    position: absolute;
    top: calc(100% + 20px);
    right: 0;
    width: 272px;
    padding: 10px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 24px 44px rgba(15, 23, 42, 0.16);
    z-index: 42;
    display: none;
  }
  .lfa-settings-menu--open {
    display: block;
  }
  .lfa-account-menu--open {
    display: block;
  }
  .lfa-account-menu-profile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px 10px;
  }
  .lfa-account-menu-avatar,
  .lfa-account-menu-avatar-fallback {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .lfa-account-menu-avatar img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .lfa-account-menu-avatar-fallback {
    background: linear-gradient(135deg, #efeaff 0%, #ede9fe 100%);
    color: #615DEC;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lfa-account-menu-copy {
    min-width: 0;
  }
  .lfa-account-menu-name {
    font-size: 13px;
    font-weight: 800;
    line-height: 1.25;
    color: #1f2937;
    margin-bottom: 2px;
    word-break: break-word;
  }
  .lfa-account-menu-email {
    font-size: 12px;
    color: #6b7280;
    word-break: break-word;
  }
  .lfa-account-menu-divider {
    height: 1px;
    background: #edf1f7;
    margin: 0 0 6px;
  }
  .lfa-account-menu-link {
    width: 100%;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 6px;
    color: #1f2937;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    border-radius: 12px;
    transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
  }
  .lfa-account-menu-link:hover,
  .lfa-account-menu-link:focus-visible {
    background: #f8f8ff;
    color: #111827;
    outline: none;
  }
  .lfa-account-menu-link--danger {
    color: #ef4444;
  }
  .lfa-account-menu-link--danger:hover,
  .lfa-account-menu-link--danger:focus-visible {
    background: #fef2f2;
    color: #dc2626;
  }
  .lfa-account-menu-link-icon {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f6f7fb;
    color: #4b5563;
    flex-shrink: 0;
  }
  .lfa-account-menu-link-icon svg,
  .lfa-account-menu-avatar-fallback svg {
    width: 24px;
    height: 24px;
  }
  .lfa-account-menu-link--danger .lfa-account-menu-link-icon {
    background: #fef2f2;
    color: inherit;
  }
  .lfa-settings-link {
    width: 100%;
    border: none;
    background: transparent;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px;
    margin-bottom: 4px;
    font-size: 14px;
    font-weight: 700;
    color: #1f2937;
    cursor: pointer;
    text-align: left;
    border-radius: 12px;
    transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
  }
  .lfa-settings-link:hover,
  .lfa-settings-link:focus-visible {
    background: #f8f8ff;
    color: #111827;
    outline: none;
  }
  .lfa-settings-link-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lfa-settings-link-icon svg {
    width: 15px;
    height: 15px;
  }
  .lfa-settings-link-icon--primary {
    background: #eeecff;
    color: #615DEC;
  }
  .lfa-settings-divider {
    height: 1px;
    background: #edf1f7;
    margin: 2px 0 10px;
  }
  .lfa-settings-section-title {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #9ca3af;
    margin-bottom: 6px;
  }
  .lfa-settings-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 0;
  }
  .lfa-settings-row-label {
    font-size: 12px;
    line-height: 1.3;
    color: #4b5563;
  }
  button.lfa-settings-switch {
    appearance: none;
    -webkit-appearance: none;
    box-sizing: content-box;
    display: block;
    width: 34px;
    height: 18px;
    padding: 1px 2px;
    margin: 0;
    border-radius: 999px;
    border: 1px solid #dbe3f0;
    background: #e5e7eb;
    cursor: pointer;
    outline: none;
    transition: background 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), border-color 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    flex-shrink: 0;
  }
  button.lfa-settings-switch.active {
    background: #615DEC;
    border-color: #615DEC;
    box-shadow: 0 0 0 2px rgba(97, 93, 236, 0.18);
  }
  .lfa-settings-switch-thumb {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2);
    transition: transform 0.45s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  button.lfa-settings-switch.active .lfa-settings-switch-thumb {
    transform: translateX(19px);
    box-shadow: 0 1px 6px rgba(15, 23, 42, 0.25);
  }
  .lfa-settings-row[data-setting-help]:has(.lfa-settings-switch:hover)::after {
    content: attr(data-setting-help);
    position: absolute;
    right: 8px;
    bottom: calc(100% + 10px);
    width: 230px;
    padding: 12px 14px;
    border-radius: 14px;
    background: #111827;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.45;
    box-shadow: 0 12px 24px rgba(15, 23, 42, 0.24);
    z-index: 2;
  }
  .lfa-settings-row[data-setting-help]:has(.lfa-settings-switch:hover)::before {
    content: '';
    position: absolute;
    right: 54px;
    bottom: calc(100% + 2px);
    width: 14px;
    height: 14px;
    background: #111827;
    transform: rotate(45deg);
    z-index: 1;
  }
  .lfa-header-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }
  .lfa-header-avatar img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
  }
  .lfa-avatar-fallback {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .lfa-avatar-fallback svg {
    width: 14px;
    height: 14px;
  }

  `;
