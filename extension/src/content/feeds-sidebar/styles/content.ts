export const CONTENT_CSS = `.lfa-sidebar-content {
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

  `;
