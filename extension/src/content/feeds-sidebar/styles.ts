export const FEEDS_SIDEBAR_CSS = `
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

  .lfa-sidebar-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .lfa-unauth {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 40px 40px;
    text-align: center;
    flex: 1;
  }
  .lfa-unauth-icon {
    margin-bottom: 20px;
  }
  .lfa-unauth-title {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a2e;
    margin-bottom: 8px;
  }
  .lfa-unauth-desc {
    font-size: 14px;
    color: #6b7280;
    margin-bottom: 28px;
    line-height: 1.5;
  }
  .lfa-signin-btn {
    background: #615DEC;
    color: #fff;
    border: none;
    padding: 12px 48px;
    border-radius: 24px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .lfa-signin-btn:hover {
    background: #504CC9;
  }
  .lfa-sidebar-pro-promo {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  .lfa-sidebar-pro-btn {
    width: min(100%, 320px);
    background: linear-gradient(180deg, #ffd95a 0%, #ffcf3f 100%);
    color: #1a1a1a;
    border: none;
    padding: 14px 24px;
    border-radius: 18px;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow:
      0 10px 24px rgba(245, 158, 11, 0.20),
      inset 0 1px 0 rgba(255, 255, 255, 0.45);
    transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }
  .lfa-sidebar-pro-btn:hover {
    background: linear-gradient(180deg, #ffe27b 0%, #ffd24d 100%);
    box-shadow:
      0 14px 28px rgba(245, 158, 11, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }
  .lfa-sidebar-pro-activate {
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.45;
  }
  .lfa-sidebar-pro-link {
    margin-left: 6px;
    color: #1a1a1a;
    font-weight: 700;
    cursor: pointer;
  }
  .lfa-sidebar-pro-link:hover {
    color: #d97706;
  }
  .lfa-open-dashboard-link {
    margin-top: 14px;
    font-size: 13px;
    color: #615DEC;
    text-decoration: none;
    cursor: pointer;
  }
  .lfa-unauth-hint {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 12px;
    margin-bottom: 0;
    line-height: 1.4;
  }
  .lfa-auth-error {
    margin-top: 14px;
    color: #dc2626;
    font-size: 12px;
    line-height: 1.5;
    max-width: 320px;
  }
  .lfa-help-link {
    margin-top: 16px;
    font-size: 13px;
    color: #9ca3af;
    text-decoration: none;
    cursor: pointer;
  }
  .lfa-help-link:hover {
    color: #615DEC;
  }

  .lfa-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 40px;
    flex: 1;
  }
  .lfa-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e5e7eb;
    border-top-color: #615DEC;
    border-radius: 50%;
    animation: lfa-spin 0.7s linear infinite;
  }
  @keyframes lfa-spin {
    to { transform: rotate(360deg); }
  }
  .lfa-loading p {
    margin-top: 12px;
    color: #9ca3af;
    font-size: 14px;
  }

  .lfa-auth {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .lfa-tabs {
    display: flex;
    margin: 12px 12px 6px;
    padding: 3px;
    border: 1px solid #d8e0ee;
    border-radius: 16px;
    background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 8px 18px rgba(15, 23, 42, 0.05);
    flex-shrink: 0;
    overflow: hidden;
  }
  .lfa-tab {
    flex: 1;
    border: none;
    background: transparent;
    min-height: 48px;
    padding: 0 12px;
    font-size: 14px;
    font-weight: 700;
    color: #64748b;
    cursor: pointer;
    border-radius: 12px;
    transition:
      background 0.18s ease,
      color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;
  }
  .lfa-tab.active {
    color: #2563eb;
    background: linear-gradient(180deg, #edf3ff 0%, #e7efff 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 4px 10px rgba(37, 99, 235, 0.08);
  }
  .lfa-tab:not(.active):hover {
    color: #475569;
    background: rgba(241, 245, 249, 0.85);
  }

  .lfa-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    flex-shrink: 0;
  }
  .lfa-search {
    flex: 1;
    min-height: 46px;
    box-sizing: border-box;
    padding: 0 16px !important;
    border: 1px solid rgba(203, 213, 225, 0.95) !important;
    border-radius: 14px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    font-family: inherit;
    outline: none;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%) !important;
    color: #0f172a !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.96),
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 10px 24px rgba(15, 23, 42, 0.05) !important;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  }
  .lfa-search::placeholder {
    color: #94a3b8;
    font-weight: 400;
  }
  .lfa-search:focus {
    border-color: #615DEC !important;
    box-shadow:
      0 0 0 4px rgba(97, 93, 236, 0.14),
      0 14px 28px rgba(97, 93, 236, 0.10) !important;
    transform: translateY(-1px);
  }
  .lfa-add-feed-btn {
    background: #615DEC;
    color: #fff;
    border: none;
    min-height: 46px;
    padding: 0 18px;
    border-radius: 14px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .lfa-add-feed-btn:hover {
    background: #504CC9;
  }
  .lfa-toolbar-dashboard-btn {
    width: 46px;
    min-width: 46px;
    height: 46px;
    border: 1px solid rgba(203, 213, 225, 0.95);
    border-radius: 14px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.96),
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 10px 24px rgba(15, 23, 42, 0.05);
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease, color 0.18s ease;
  }
  .lfa-toolbar-dashboard-btn:hover {
    color: #475569;
    border-color: #bfd0eb;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.98),
      0 12px 26px rgba(15, 23, 42, 0.08);
  }
  .lfa-toolbar-dashboard-btn:focus-visible {
    outline: 3px solid rgba(97, 93, 236, 0.16);
    outline-offset: 2px;
  }

  .lfa-create-form {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .lfa-create-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #615DEC;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
  }
  .lfa-create-ok, .lfa-create-cancel {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.15s;
  }
  .lfa-create-ok {
    background: #615DEC;
    color: #fff;
  }
  .lfa-create-ok:hover {
    background: #504CC9;
  }
  .lfa-create-cancel {
    background: #f3f4f6;
    color: #6b7280;
  }
  .lfa-create-cancel:hover {
    background: #e5e7eb;
  }

  .lfa-feed-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px;
    overflow-anchor: none;
  }
  .lfa-feed-group {
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    margin-bottom: 10px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
    transition: box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
  }
  .lfa-feed-group.lfa-feed-group--dragging {
    opacity: 0.55;
    box-shadow: 0 12px 26px rgba(97, 93, 236, 0.16);
  }
  .lfa-feed-group.lfa-feed-group--drop-target {
    border-color: rgba(97, 93, 236, 0.45);
    box-shadow: 0 0 0 3px rgba(97, 93, 236, 0.10);
  }
  .lfa-feed-item {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    cursor: pointer;
    background: #fff;
    transition: background-color 0.24s ease;
    gap: 10px;
  }
  .lfa-feed-item--shared {
    background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
  }
  .lfa-feed-item:hover,
  .lfa-feed-item--expanded,
  .lfa-feed-item--settling {
    background: #f5f3ff;
  }
  .lfa-feed-item--settling {
    transition: none;
  }
  .lfa-feed-item--shared.lfa-feed-item--expanded {
    background: #f5f3ff;
  }
  .lfa-feed-grip {
    width: 16px;
    height: 16px;
    color: rgba(100, 116, 139, 0.55);
    flex-shrink: 0;
    cursor: grab;
  }
  .lfa-feed-item:active .lfa-feed-grip {
    cursor: grabbing;
  }
  .lfa-feed-grip--hidden {
    opacity: 0;
    pointer-events: none;
  }
  .lfa-feed-name-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lfa-feed-name {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    align-self: flex-start;
    width: auto;
    max-width: 100%;
    margin: 0;
    padding: 4px 8px;
    border-radius: 8px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 700;
    color: #0f172a;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transform-origin: left center;
    transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
  }
  .lfa-feed-name:hover {
    background: rgba(15, 23, 42, 0.06);
    color: #615DEC;
    transform: scale(1.1);
  }
  .lfa-feed-name:focus-visible {
    outline: 2px solid rgba(97, 93, 236, 0.24);
    outline-offset: 2px;
  }
  .lfa-feed-owner-badge {
    font-size: 11px;
    color: #615DEC;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lfa-feed-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
  }
  .lfa-feed-role {
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 999px;
    background: #eef2ff;
    color: #615DEC;
  }
  .lfa-feed-preview {
    display: flex;
    align-items: center;
    margin-right: 2px;
  }
  .lfa-feed-preview-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #fff;
    margin-left: -5px;
    background: #e2e8f0;
  }
  .lfa-feed-preview-avatar:first-child {
    margin-left: 0;
  }
  .lfa-feed-preview-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
  }
  .lfa-feed-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    transition: transform 0.15s ease;
  }
  .lfa-feed-chevron.expanded {
    transform: rotate(180deg);
  }
  .lfa-feed-expanded {
    border-top: 1px solid #eef2f7;
    background: #fcfcfd;
    padding: 6px 10px 10px;
    overflow: hidden;
    transform-origin: top center;
    animation: lfa-feed-expanded-enter 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lfa-feed-expanded--collapsing {
    pointer-events: none;
  }
  .lfa-feed-expanded-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 6px;
  }
  .lfa-feed-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lfa-feed-members-state,
  .lfa-feed-members-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 18px 14px;
    font-size: 13px;
    color: #94a3b8;
  }
  .lfa-spinner--small {
    width: 18px;
    height: 18px;
    border-width: 2px;
  }
  .lfa-feed-members-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: clamp(240px, calc(100vh - 320px), 416px);
    overflow-y: auto;
    overscroll-behavior: auto;
    padding-right: 2px;
    scrollbar-gutter: stable;
  }
  @keyframes lfa-feed-expanded-enter {
    from {
      opacity: 0;
      transform: translateY(-8px) scaleY(0.985);
      clip-path: inset(0 0 100% 0);
    }
    to {
      opacity: 1;
      transform: translateY(0) scaleY(1);
      clip-path: inset(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .lfa-feed-expanded {
      animation: none;
    }
  }
  .lfa-member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 10px;
    background: transparent;
    transition: background 0.15s ease;
  }
  .lfa-member-row:hover {
    background: #f8fafc;
  }
  .lfa-member-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
    padding-right: 10px;
  }
  .lfa-member-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: #e2e8f0;
  }
  .lfa-member-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }
  .lfa-member-info {
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .lfa-member-name {
    border: none;
    background: transparent;
    padding: 0;
    font-size: 12px;
    font-weight: 600;
    color: #2563eb;
    cursor: pointer;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
  }
  .lfa-member-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
  }
  .lfa-member-name:hover {
    color: #1d4ed8;
  }
  .lfa-member-premium-icon {
    font-size: 9px;
    color: #c8960c;
    vertical-align: middle;
    margin-left: 2px;
    pointer-events: none;
    flex-shrink: 0;
  }
  .lfa-member-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    justify-content: flex-end;
    min-width: 278px;
  }
  .lfa-member-icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .lfa-share-modal {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .lfa-share-modal-shell {
    overflow: visible;
  }
  .lfa-share-modal-body {
    overflow: visible;
  }
  .lfa-share-modal .lfs-dropdown {
    z-index: 20;
  }
  .lfa-share-modal .lfs-dropdown__menu {
    z-index: 120;
  }
  .lfa-share-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 4px;
    border: 1px solid #dbe3f0;
    border-radius: 14px;
    background: #fff;
  }
  .lfa-share-tab {
    border: none;
    background: transparent;
    min-height: 56px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
  }
  .lfa-share-tab--active {
    background: #eef0ff;
    color: #5b57e6;
  }
  .lfa-share-tab--link.lfa-share-tab--active {
    background: #fff8e8;
    color: #e0a500;
  }
  .lfa-share-panel {
    border: 1px solid #d9dcff;
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: linear-gradient(180deg, #fcfcff 0%, #f8f9ff 100%);
  }
  .lfa-share-panel--link {
    border-color: #f4e6b4;
    background: linear-gradient(180deg, #fffdf7 0%, #fffaf0 100%);
  }
  .lfa-share-panel-title {
    font-size: 16px;
    line-height: 1.45;
    color: #1f2937;
  }
  .lfa-share-email-row {
    display: grid;
    grid-template-columns: 1fr 190px;
    gap: 12px;
  }
  .lfa-share-email-input {
    min-height: 50px !important;
  }
  .lfa-share-role-dropdown {
    min-width: 0;
  }
  .lfa-share-submit-btn {
    min-height: 52px;
    font-size: 16px;
  }
  .lfa-share-link-box {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid #e6e8ef;
    border-radius: 14px;
    padding: 14px;
    background: #fff;
  }
  .lfa-share-link-value {
    flex: 1;
    font-size: 14px;
    line-height: 1.5;
    color: #374151;
    word-break: break-all;
  }
  .lfa-share-feedback {
    font-size: 13px;
    font-weight: 600;
  }
  .lfa-share-feedback--success {
    color: #16a34a;
  }
  .lfa-share-feedback--error {
    color: #dc2626;
  }
  .lfa-share-shared-with-title {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }
  .lfa-share-loading {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    border: 1px solid #e7ebf3;
    border-radius: 16px;
    background: #fff;
  }
  .lfa-share-loading-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .lfa-share-loading-title {
    font-size: 15px;
    font-weight: 700;
    color: #1f2937;
  }
  .lfa-share-loading-text {
    font-size: 13px;
    color: #64748b;
  }
  .lfa-share-empty {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #94a3b8;
  }
  .lfa-share-empty-icon {
    margin-bottom: 10px;
    color: #a1a1aa;
  }
  .lfa-share-empty-title {
    font-size: 16px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 6px;
  }
  .lfa-share-empty-text {
    font-size: 14px;
  }
  .lfa-share-empty--small {
    min-height: 80px;
  }
  .lfa-share-recipient-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .lfa-share-recipient {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid #e7ebf3;
    border-radius: 14px;
    background: #fff;
  }
  .lfa-share-recipient-main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .lfa-share-recipient-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
    background: #e2e8f0;
  }
  .lfa-share-recipient-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
  }
  .lfa-share-recipient-name {
    font-size: 14px;
    font-weight: 700;
    color: #1f2937;
  }
  .lfa-share-recipient-email {
    font-size: 13px;
    color: #64748b;
  }
  .lfa-share-recipient-role {
    font-size: 13px;
    font-weight: 700;
    color: #5b57e6;
  }
  .lfa-share-recipient-role-wrap {
    width: 192px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    flex-shrink: 0;
  }
  .lfa-share-recipient-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lfa-share-recipient-role-dropdown {
    min-width: 0;
    flex: 1 1 auto;
  }
  .lfa-share-recipient-role-dropdown .lfs-dropdown__trigger {
    min-height: 40px;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 700;
    box-shadow: none;
  }
  .lfa-share-recipient-role-status {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-align: right;
  }
  .lfa-share-recipient-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .lfa-share-recipient-remove-btn {
    appearance: none;
    -webkit-appearance: none;
    width: 40px;
    min-width: 40px;
    height: 40px;
    border: 1px solid #f1d2d2;
    border-radius: 12px;
    background: linear-gradient(180deg, #fff 0%, #fff6f6 100%);
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(239, 68, 68, 0.08);
    transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }
  .lfa-share-recipient-remove-btn:hover:not(:disabled) {
    border-color: #ef4444;
    color: #dc2626;
    box-shadow: 0 14px 28px rgba(239, 68, 68, 0.14);
  }
  .lfa-share-recipient-remove-btn:disabled {
    cursor: default;
    color: #94a3b8;
    border-color: #e2e8f0;
    background: #f8fafc;
    box-shadow: none;
  }
  @media (max-width: 640px) {
    .lfa-share-recipient {
      align-items: flex-start;
      flex-direction: column;
    }
    .lfa-share-recipient-main {
      width: 100%;
    }
    .lfa-share-recipient-role-wrap {
      width: 100%;
    }
    .lfa-share-recipient-controls {
      width: 100%;
    }
    .lfa-share-recipient-actions {
      justify-content: flex-end;
    }
  }
  .lfa-duplicate-modal,
  .lfa-followed-modal {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .lfa-duplicate-icon,
  .lfa-followed-modal-check {
    width: 74px;
    height: 74px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8px 0 18px;
  }
  .lfa-duplicate-icon {
    background: #fff4cc;
    color: #f4b400;
  }
  .lfa-followed-modal-check {
    background: #efebff;
    color: #615DEC;
  }
  .lfa-duplicate-text,
  .lfa-followed-modal-text {
    font-size: 16px;
    line-height: 1.55;
    color: #4b5563;
  }
  .lfa-duplicate-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-top: 24px;
  }
  .lfa-followed-modal-title {
    font-size: 18px;
    font-weight: 800;
    color: #1f2937;
    margin-bottom: 16px;
  }
  .lfa-followed-modal-card {
    width: 100%;
    border-radius: 16px;
    background: #f8fafc;
    padding: 18px;
    margin-bottom: 18px;
  }
  .lfa-followed-modal-feed-name {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 10px;
  }
  .lfa-followed-modal-owner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 14px;
    color: #6b7280;
  }
  .lfa-member-icon-btn:hover {
    background: #eef2ff;
    color: #334155;
  }
  .lfa-member-icon-btn--disabled,
  .lfa-member-icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }
  .lfa-member-icon-btn--danger:hover {
    background: #fef2f2;
    color: #dc2626;
  }
  .lfa-member-status {
    border: none;
    border-radius: 999px;
    width: 112px;
    height: 25px;
    min-height: 25px;
    padding: 0 8px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
    text-align: center;
  }
  .lfa-member-status--follow {
    background: #dbeafe;
    color: #2563eb;
    cursor: pointer;
  }
  .lfa-member-status--connect {
    background: #dbeafe;
    color: #2563eb;
    cursor: pointer;
  }
  .lfa-member-status--pending {
    background: #ffedd5;
    color: #ea580c;
  }
  .lfa-member-status--connected {
    background: #dcfce7;
    color: #059669;
  }
  .lfa-member-status--following {
    background: #e0f2fe;
    color: #0369a1;
    cursor: pointer;
  }
  .lfa-member-status--withdrawn {
    background: #fef3c7;
    color: #b45309;
  }
  .lfa-member-status--unavailable {
    background: #fee2e2;
    color: #dc2626;
  }
  .lfa-member-status--loading {
    background: #f1f5f9;
    color: #94a3b8;
  }
  .lfa-status-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid #cbd5e1;
    border-top-color: #64748b;
    border-radius: 50%;
    animation: lfa-spin 0.7s linear infinite;
  }
  .lfa-member-status--split {
    padding: 0;
    gap: 0;
    overflow: hidden;
    background: #e8eefc;
    border: 1px solid #d7e2fb;
  }
  .lfa-member-status-split-btn {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    background: transparent;
    flex: 1 1 50%;
    height: 100%;
    min-height: 25px;
    padding: 0 4px;
    margin: 0;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition: background-color 0.16s ease, color 0.16s ease;
  }
  .lfa-member-status-split-btn--follow {
    color: #0369a1;
    background: rgba(224, 242, 254, 0.9);
  }
  .lfa-member-status-split-btn--connect {
    color: #2563eb;
    background: rgba(219, 234, 254, 0.9);
    border-left: 1px solid #d7e2fb;
  }
  .lfa-member-status-split-btn:hover {
    filter: brightness(0.97);
  }
  .lfa-member-status--follow:hover,
  .lfa-member-status--connect:hover,
  .lfa-member-status--following:hover {
    filter: brightness(0.97);
  }

  .lfa-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    z-index: 100000;
    pointer-events: none;
    animation: lfa-toast-in 0.25s ease;
  }
  .lfa-toast--success { background: #059669; }
  .lfa-toast--error { background: #dc2626; }
  @keyframes lfa-toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(10px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  .lfa-member-editor {
    position: absolute;
    inset: 0;
    background: #fff;
    z-index: 3;
    display: flex;
    flex-direction: column;
  }
  .lfa-member-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #e5e7eb;
  }
  .lfa-member-editor-back,
  .lfa-member-editor-close {
    border: none;
    background: none;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  }
  .lfa-member-editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 22px 18px 28px;
    background:
      radial-gradient(circle at top left, rgba(97, 93, 236, 0.08), transparent 32%),
      linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  }
  .lfa-member-editor-profile {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
    padding: 16px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 14px 40px rgba(15, 23, 42, 0.06);
  }
  .lfa-member-editor-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    background: #e2e8f0;
    flex-shrink: 0;
  }
  .lfa-member-editor-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
    color: white;
    font-size: 20px;
    font-weight: 700;
  }
  .lfa-member-editor-name {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }
  .lfa-member-editor-headline,
  .lfa-member-editor-feed {
    margin-top: 4px;
    font-size: 13px;
    color: #64748b;
    line-height: 1.45;
  }
  .lfa-member-editor-grid {
    display: grid;
    gap: 2px;
  }
  .lfa-member-editor-footer {
    padding: 14px 16px;
    border-top: 1px solid #e5e7eb;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(8px);
  }
  .lfa-member-editor-save {
    width: 100%;
    border: none;
    border-radius: 16px;
    padding: 14px 16px;
    background: linear-gradient(135deg, #615DEC 0%, #4F46E5 100%);
    color: #fff;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 16px 34px rgba(97, 93, 236, 0.28);
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
  }
  .lfa-member-editor-save:hover {
    filter: brightness(1.02);
    box-shadow: 0 18px 40px rgba(97, 93, 236, 0.34);
  }

  .lfa-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 40px;
    text-align: center;
    flex: 1;
  }
  .lfa-empty p {
    font-size: 16px;
    font-weight: 600;
    color: #6b7280;
  }
  .lfa-empty-hint {
    font-size: 13px !important;
    font-weight: 400 !important;
    color: #9ca3af !important;
    margin-top: 6px;
  }

  .lfa-sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.15);
    z-index: 99997;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }
  .lfa-sidebar-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .lfa-feed-modal-form {
    display: grid;
    gap: 8px;
  }
  .lfa-feed-modal-body--search {
    padding-top: 4px;
    min-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lfa-feed-modal-input--search {
    min-height: 48px !important;
    padding-left: 42px !important;
    font-size: 15px !important;
  }
  .lfa-feed-search-tabs {
    padding: 0;
  }
  .lfa-feed-search-tab {
    width: 100%;
    height: 42px;
    border: 1px solid #dbe3f0;
    border-radius: 10px;
    background: #f3f4ff;
    color: #615DEC;
    font-size: 15px;
    font-weight: 700;
  }
  .lfa-feed-search-input-wrap {
    position: relative;
  }
  .lfa-feed-search-input-wrap > svg {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #98a2b3;
    z-index: 1;
  }
  .lfa-feed-people-results {
    flex: 1;
    min-height: 220px;
    overflow: auto;
  }
  .lfa-feed-people-loading,
  .lfa-feed-people-empty {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #98a2b3;
    text-align: center;
  }
  .lfa-feed-people-empty--small {
    min-height: 140px;
  }
  .lfa-feed-people-empty-icon {
    margin-bottom: 10px;
    color: #d4dae6;
  }
  .lfa-feed-people-empty-title {
    font-size: 18px;
    font-weight: 500;
    color: #5b6474;
    margin-bottom: 6px;
  }
  .lfa-feed-people-empty-text {
    font-size: 14px;
    color: #98a2b3;
  }
  .lfa-feed-people-loading {
    gap: 10px;
    font-size: 14px;
  }
  .lfa-feed-person-row {
    width: 100%;
    border: 1px solid #dbe3f0;
    border-radius: 12px;
    background: #fff;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    margin-bottom: 8px;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }
  .lfa-feed-person-row:hover {
    border-color: rgba(97, 93, 236, 0.36);
    box-shadow: 0 10px 20px rgba(97, 93, 236, 0.08);
  }
  .lfa-feed-person-row--selected {
    border-color: rgba(97, 93, 236, 0.55);
    background: #f7f6ff;
  }
  .lfa-feed-person-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .lfa-feed-person-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    background: #e2e8f0;
    flex-shrink: 0;
  }
  .lfa-feed-person-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
  }
  .lfa-feed-person-text {
    min-width: 0;
    text-align: left;
  }
  .lfa-feed-person-name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 700;
    color: #4f46e5;
    margin-bottom: 2px;
  }
  .lfa-feed-person-degree {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    background: #e7efff;
    color: #3863d9;
    font-size: 11px;
    font-weight: 700;
  }
  .lfa-feed-person-headline {
    font-size: 13px;
    color: #697386;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 620px;
  }
  .lfa-feed-person-toggle {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #f4f6fb;
    color: #98a2b3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
  }
  .lfa-feed-person-row--selected .lfa-feed-person-toggle {
    background: #615DEC;
    color: #fff;
    font-size: 15px;
    font-weight: 700;
  }
  .lfa-feed-people-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
  }
  .lfa-feed-people-count {
    font-size: 14px;
    font-weight: 500;
    color: #5b6474;
  }
  .lfa-feed-people-add-btn {
    min-width: 170px;
  }
`;
