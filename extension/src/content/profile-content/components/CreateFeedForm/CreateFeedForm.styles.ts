export const CREATE_FEED_FORM_CSS = `
  .pf-create-feed-body {
    padding: 20px;
  }

  .pf-create-feed-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 12px;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }

  .pf-create-feed-input:focus {
    border-color: #615DEC;
  }

  .pf-create-feed-colors {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .pf-color-option {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    border: 3px solid transparent;
    transition: all 0.15s;
  }

  .pf-color-option:hover {
    transform: scale(1.1);
  }

  .pf-color-option.active {
    border-color: #1a1a1a;
    box-shadow: 0 0 0 2px white, 0 0 0 4px currentColor;
  }

  .pf-create-feed-submit {
    width: 100%;
    padding: 10px;
    background: #615DEC;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pf-create-feed-submit:hover {
    background: #504CC9;
  }

  .pf-create-feed-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
