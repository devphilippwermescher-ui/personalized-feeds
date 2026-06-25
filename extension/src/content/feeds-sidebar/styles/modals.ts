export const MODALS_CSS = `.lfa-share-modal {
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
    position: relative;
    padding: 0;
    gap: 0;
    overflow: visible;
    background: #e8eefc;
    border: 1px solid #d7e2fb;
  }
  .lfa-member-status--split-state {
    width: 112px;
  }
  .lfa-member-status-split-btn {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    background: transparent;
    flex: 1 1 50%;
    height: 100%;
    min-height: 25px;
    padding: 0 5px;
    margin: 0;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.16s ease, color 0.16s ease;
  }
  .lfa-member-status-split-btn svg {
    flex-shrink: 0;
  }
  .lfa-member-status-split-btn--follow {
    color: #0369a1;
    background: rgba(224, 242, 254, 0.9);
    border-radius: 999px 0 0 999px;
  }
  .lfa-member-status--split-state .lfa-member-status-split-btn--follow {
    flex: 0 0 49px;
  }
  .lfa-member-status-split-btn--connect {
    color: #2563eb;
    background: rgba(219, 234, 254, 0.9);
    border-left: 1px solid #d7e2fb;
    border-radius: 0 999px 999px 0;
  }
  .lfa-member-status-split-btn--connected {
    color: #059669;
    background: #dcfce7;
    border-left: 1px solid #d7e2fb;
  }
  .lfa-member-status-split-btn--pending {
    color: #ea580c;
    background: #ffedd5;
    border-left: 1px solid #d7e2fb;
  }
  .lfa-member-status-split-btn--withdrawn {
    color: #b45309;
    background: #fef3c7;
    border-left: 1px solid #d7e2fb;
    border-radius: 0 999px 999px 0;
  }
  .lfa-member-status-split-btn--state {
    flex: 1 1 auto;
    cursor: default;
    padding-left: 7px;
    padding-right: 8px;
    border-radius: 0 999px 999px 0;
  }
  .lfa-member-status-split-btn--state:disabled {
    opacity: 1;
  }
  .lfa-member-status-split-btn:hover {
    filter: brightness(0.97);
  }
  .lfa-member-status-split-btn--state:hover {
    filter: none;
  }
  .lfa-member-status-tooltip {
    position: absolute;
    top: calc(100% + 9px);
    right: -2px;
    width: 218px;
    max-width: min(218px, calc(100vw - 32px));
    padding: 8px 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 7px;
    background: #172033;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0;
    white-space: normal;
    text-align: left;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.20);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.14s ease, transform 0.14s ease;
    z-index: 20;
  }
  .lfa-member-status-tooltip::before {
    content: '';
    position: absolute;
    right: 26px;
    bottom: 100%;
    width: 8px;
    height: 8px;
    background: #172033;
    border-left: 1px solid rgba(148, 163, 184, 0.22);
    border-top: 1px solid rgba(148, 163, 184, 0.22);
    transform: translateY(50%) rotate(45deg);
  }
  .lfa-member-status-split-btn--state:hover + .lfa-member-status-tooltip,
  .lfa-member-status-split-btn--state:focus-visible + .lfa-member-status-tooltip {
    opacity: 1;
    transform: translateY(0);
  }
  .lfa-member-status--follow:hover,
  .lfa-member-status--connect:hover,
  .lfa-member-status--following:hover {
    filter: brightness(0.97);
  }

  `;
