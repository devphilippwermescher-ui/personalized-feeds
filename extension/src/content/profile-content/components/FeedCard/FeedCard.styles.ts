export const FEED_CARD_CSS = `
  #pf-feed-card {
    margin: 0px 24px 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .pf-feed-card-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  }

  .pf-feed-card-left {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .pf-feed-icon-wrapper {
    margin-right: 12px;
    display: flex;
    align-items: center;
    position: relative;
    flex-shrink: 0;
  }

  .pf-feed-icon-box {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #615DEC;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(97,93,236,0.3);
  }

  .pf-feed-card-logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
    display: block;
  }

  .pf-feed-status-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    background: #DC2626;
    color: white;
  }

  .pf-feed-status-badge.in-feed {
    background: #059669;
  }

  .pf-feed-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .pf-feed-info-text {
    font-size: 14px;
    font-weight: 500;
    color: #1a1a1a;
  }

  .pf-feed-memberships {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .pf-feed-membership-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    color: white;
    cursor: default;
  }

  .pf-feed-membership-tag .pf-remove-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0.7;
    font-size: 13px;
    line-height: 1;
    min-width: 12px;
    min-height: 12px;
    transform: translateY(-0.5px);
  }

  .pf-feed-membership-tag .pf-remove-tag:hover {
    opacity: 1;
  }

  .pf-feed-card-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 12px;
  }

  .pf-add-to-feed-button {
    padding: 8px 16px;
    background: #615DEC;
    color: white;
    border: none;
    border-radius: 16px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .pf-add-to-feed-button:hover {
    background: #504CC9;
  }

  .pf-add-to-feed-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .pf-add-to-feed-button.is-loading {
    opacity: 0.92;
  }
`;
