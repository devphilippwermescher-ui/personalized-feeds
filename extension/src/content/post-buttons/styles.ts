export const POST_BUTTONS_CSS = `
  .la-toast {
    position: fixed;
    right: 24px;
    bottom: 24px;
    max-width: min(420px, calc(100vw - 32px));
    padding: 12px 18px;
    border-radius: 12px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
    z-index: 100000;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.22);
    animation: lfa-post-toast-slide 0.22s ease;
  }

  .la-toast.success {
    background: #059669;
  }

  .la-toast.error {
    background: #dc2626;
  }

  @keyframes lfa-post-toast-slide {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .lfa-post-toggle {
    position: absolute;
    top: 20px;
    right: -24px;
    z-index: 50;
  }

  .lfa-post-toggle-btn {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #e0e0e0;
    border-left: none;
    padding: 4px;
    cursor: pointer;
    border-radius: 0 6px 6px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    position: relative;
    box-shadow: 1px 1px 4px rgba(0, 0, 0, 0.08);
    width: 24px;
    height: 28px;
    opacity: 0.6;
  }

  .lfa-post-toggle-btn:hover,
  .lfa-post-toggle-btn:focus-visible {
    opacity: 1;
    box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.15);
    background: #fff;
    outline: none;
  }

  .lfa-post-toggle-btn img {
    width: 14px;
    height: 14px;
    display: block;
  }

  .lfa-post-drawer-btn-wrapper {
    display: inline-flex;
    margin-left: 6px;
    align-items: center;
    vertical-align: middle;
    position: relative;
    z-index: 100;
    pointer-events: auto;
  }

  .lfa-post-drawer-btn {
    height: 22px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: #615DEC;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    position: relative;
    z-index: 101;
    pointer-events: auto;
  }

  .lfa-post-drawer-btn:hover,
  .lfa-post-drawer-btn:focus-visible {
    background: #f8f8ff;
    border-color: #c7d2fe;
    box-shadow: 0 2px 6px rgba(97, 93, 236, 0.15);
    outline: none;
  }

  .lfa-post-drawer-btn img {
    width: 12px;
    height: 12px;
    display: block;
  }

  .lfa-post-drawer-btn-label {
    white-space: nowrap;
  }

  .lfa-post-feed-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 99998;
    background: rgba(15, 23, 42, 0.28);
    display: none;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .lfa-post-feed-modal {
    width: min(520px, calc(100vw - 32px));
    max-height: min(80vh, 720px);
    overflow: hidden;
    border-radius: 24px;
    background: #fff;
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.22);
    display: flex;
    flex-direction: column;
  }

  .lfa-post-feed-modal__header,
  .lfa-post-feed-modal__footer {
    padding: 20px 24px;
    border-bottom: 1px solid #edf1f7;
  }

  .lfa-post-feed-modal__footer {
    border-top: 1px solid #edf1f7;
    border-bottom: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .lfa-post-feed-modal__title {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #111827;
  }

  .lfa-post-feed-modal__subtitle {
    margin-top: 6px;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.5;
  }

  .lfa-post-feed-modal__close {
    position: absolute;
    top: 18px;
    right: 18px;
    width: 32px;
    height: 32px;
    border: none;
    background: #f8fafc;
    border-radius: 50%;
    cursor: pointer;
    color: #94a3b8;
  }

  .lfa-post-feed-modal__body {
    padding: 10px 14px 14px;
    overflow: auto;
  }

  .lfa-post-feed-option {
    width: 100%;
    border: 1px solid #eef2ff;
    background: #fff;
    border-radius: 18px;
    padding: 14px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    cursor: pointer;
    text-align: left;
  }

  .lfa-post-feed-option:hover,
  .lfa-post-feed-option:focus-visible {
    background: #f8f8ff;
    border-color: #c7d2fe;
    outline: none;
  }

  .lfa-post-feed-option.already-added {
    cursor: default;
    background: #f8fafc;
    border-color: #e5e7eb;
    color: #94a3b8;
  }

  .lfa-post-feed-option-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .lfa-post-feed-option-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .lfa-post-feed-option-name {
    font-size: 15px;
    font-weight: 700;
    color: #111827;
  }

  .lfa-post-feed-option.already-added .lfa-post-feed-option-name {
    color: #6b7280;
  }

  .lfa-post-feed-option-count {
    font-size: 13px;
    color: #94a3b8;
  }

  .lfa-post-feed-option-check {
    color: #10b981;
    font-size: 20px;
    font-weight: 800;
  }

  .lfa-post-feed-modal__empty {
    padding: 22px 10px 26px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
  }

  .lfa-post-feed-modal__hint {
    color: #9ca3af;
    font-size: 13px;
  }
`;
