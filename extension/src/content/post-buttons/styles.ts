import { PROFILE_FEED_MODALS_CSS } from '../shared/profile-feed-modals';

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

  ${PROFILE_FEED_MODALS_CSS}
`;
