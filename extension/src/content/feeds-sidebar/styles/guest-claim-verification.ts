export const GUEST_CLAIM_VERIFICATION_CSS = `
  .lfa-guest-claim-verification {
    margin: 12px 12px 4px;
    padding: 12px;
    border: 1px solid #ddd6fe;
    border-radius: 14px;
    background: #faf8ff;
    color: #312e81;
  }
  .lfa-guest-claim-verification-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 800;
  }
  .lfa-guest-claim-verification-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #ede9fe;
    color: #6d28d9;
    font-size: 12px;
    font-weight: 900;
  }
  .lfa-guest-claim-verification-copy,
  .lfa-guest-claim-verification-feedback {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.45;
  }
  .lfa-guest-claim-verification-copy strong {
    overflow-wrap: anywhere;
  }
  .lfa-guest-claim-verification-feedback--success {
    color: #047857;
  }
  .lfa-guest-claim-verification-feedback--error {
    color: #b91c1c;
  }
  .lfa-guest-claim-verification-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  }
  .lfa-guest-claim-verification-btn {
    min-height: 34px;
    padding: 7px 10px;
    border-radius: 9px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .lfa-guest-claim-verification-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .lfa-guest-claim-verification-btn--secondary {
    border: 1px solid #c4b5fd;
    background: #ffffff;
    color: #5b21b6;
  }
  .lfa-guest-claim-verification-btn--primary {
    border: 1px solid #615dec;
    background: #615dec;
    color: #ffffff;
  }
`;
