export const FEED_SELECTION_LIST_CSS = `
  .pf-feed-modal-body {
    max-height: 400px;
  }

  .pf-feed-modal-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px 20px;
    color: #9ca3af;
    font-size: 14px;
  }

  .pf-feed-modal-loading-spinner {
    width: 16px;
    height: 16px;
  }

  .pf-inline-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: pf-feed-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  .pf-feed-modal-loading .pf-inline-spinner,
  .pf-feed-option-loading .pf-inline-spinner {
    border-color: rgba(99, 102, 241, 0.18);
    border-top-color: currentColor;
  }

  @keyframes pf-feed-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .pf-feed-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 4px;
  }

  .pf-feed-option-status {
    min-width: 72px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .pf-feed-option:hover {
    background: #f3f4f6;
  }

  .pf-feed-option.is-disabled {
    pointer-events: none;
    opacity: 0.52;
  }

  .pf-feed-option.is-submitting {
    opacity: 1;
    background: #f5f3ff;
  }

  .pf-feed-option-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pf-feed-option-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .pf-feed-option-name {
    font-size: 14px;
    font-weight: 500;
    color: #1a1a1a;
  }

  .pf-feed-option-count {
    font-size: 12px;
    color: #9ca3af;
  }

  .pf-feed-option-check {
    font-size: 18px;
    color: #059669;
  }

  .pf-feed-option-loading {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #615DEC;
  }

  .pf-feed-option.already-added {
    opacity: 0.6;
    cursor: default;
  }

  .pf-feed-modal-footer {
    padding: 12px 20px;
  }

  .pf-feed-modal-create {
    width: 100%;
    padding: 10px;
    background: none;
    border: 2px dashed #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #615DEC;
    cursor: pointer;
    transition: all 0.15s;
  }

  .pf-feed-modal-create:hover {
    border-color: #615DEC;
    background: #f5f3ff;
  }
`;
