export const EDITORSEARCH_CSS = `.lfa-toast {
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
