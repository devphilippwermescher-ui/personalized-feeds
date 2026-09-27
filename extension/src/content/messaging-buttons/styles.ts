export const MESSAGING_BUTTONS_CSS = `
  .lfa-messaging-feed-btn-wrapper {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    vertical-align: middle;
  }

  .lfa-messaging-feed-btn {
    height: 22px;
    padding: 0 8px;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    color: #615dec;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .lfa-messaging-feed-btn:hover,
  .lfa-messaging-feed-btn:focus-visible {
    border-color: #c7d2fe;
    background: #f8f8ff;
    box-shadow: 0 2px 6px rgba(97, 93, 236, 0.15);
    outline: none;
  }

  .lfa-messaging-feed-btn img {
    width: 12px;
    height: 12px;
    display: block;
  }
`;
