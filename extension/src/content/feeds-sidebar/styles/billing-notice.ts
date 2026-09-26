export const BILLING_NOTICE_CSS = `
  .lfa-billing-notice {
    position: fixed;
    right: 14px;
    bottom: 14px;
    width: min(300px, calc(100vw - 24px));
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
    border: 1px solid #fde68a;
    border-radius: 14px;
    background: #fffbeb;
    color: #1f2937;
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.24);
    z-index: 100003;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: lfa-billing-notice-in 0.22s ease;
  }
  .lfa-billing-notice[hidden] {
    display: none;
  }
  .lfa-billing-notice--payment_failed {
    border-color: #fecaca;
    background: #fff7f7;
  }
  .lfa-billing-notice--expired {
    border-color: #ddd6fe;
    background: #faf9ff;
  }
  .lfa-billing-notice-icon {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: #fbbf24;
    color: #422006;
    font-size: 17px;
    font-weight: 800;
  }
  .lfa-billing-notice--payment_failed .lfa-billing-notice-icon {
    background: #ef4444;
    color: #fff;
  }
  .lfa-billing-notice--expired .lfa-billing-notice-icon {
    background: #615dec;
    color: #fff;
    font-family: Georgia, serif;
  }
  .lfa-billing-notice-body {
    min-width: 0;
    padding-right: 17px;
  }
  .lfa-billing-notice-title {
    display: block;
    margin: 0 0 3px;
    color: #111827;
    font-size: 14px;
    line-height: 1.3;
    font-weight: 800;
  }
  .lfa-billing-notice-message {
    margin: 0;
    color: #4b5563;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 500;
  }
  .lfa-billing-notice-action {
    appearance: none;
    margin: 9px 0 0;
    padding: 6px 10px;
    border: 0;
    border-radius: 8px;
    background: #615dec;
    color: #fff;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 750;
    cursor: pointer;
  }
  .lfa-billing-notice-action:hover {
    background: #504be0;
  }
  .lfa-billing-notice-action:focus-visible,
  .lfa-billing-notice-close:focus-visible {
    outline: 3px solid rgba(97, 93, 236, 0.28);
    outline-offset: 2px;
  }
  .lfa-billing-notice-close {
    appearance: none;
    position: absolute;
    top: 6px;
    right: 6px;
    width: 24px;
    height: 24px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #6b7280;
    font-size: 20px;
    line-height: 22px;
    cursor: pointer;
  }
  .lfa-billing-notice-close:hover {
    background: rgba(15, 23, 42, 0.06);
    color: #111827;
  }
  @keyframes lfa-billing-notice-in {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;
