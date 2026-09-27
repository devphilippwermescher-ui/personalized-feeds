export const PROFILE_PREFERENCES_CSS = `
  .mfp-profile-preferences-modal {
    width: min(560px, calc(100vw - 32px));
    border-radius: 20px;
    color: #0f172a;
  }
  .mfp-profile-preferences-modal .lfs-modal__header {
    min-height: 64px;
    padding: 16px 24px;
  }
  .mfp-profile-preferences-modal .lfs-modal__title {
    color: #1f2937;
    font-size: 20px;
    font-weight: 750;
  }
  .mfp-profile-preferences-body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 24px !important;
    color: #0f172a;
    background: #fff;
  }
  .mfp-profile-preferences-avatar-row {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .mfp-profile-preferences-avatar,
  .mfp-profile-preferences-avatar-fallback {
    width: 76px;
    height: 76px;
    flex: 0 0 76px;
    border-radius: 50%;
  }
  .mfp-profile-preferences-avatar {
    display: block;
    object-fit: cover;
    border: 3px solid #fff;
    box-shadow: 0 0 0 2px rgba(97, 93, 236, .2), 0 10px 24px rgba(15, 23, 42, .12);
  }
  .mfp-profile-preferences-avatar-fallback {
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(145deg, #615dec, #2563eb);
    box-shadow: 0 10px 24px rgba(79, 70, 229, .24);
    font-size: 26px;
    font-weight: 700;
  }
  .mfp-profile-preferences-avatar-copy {
    min-width: 0;
  }
  .mfp-profile-preferences-avatar-title {
    margin: 0 0 7px;
    color: #1f2937;
    font-size: 14px;
    font-weight: 750;
  }
  .mfp-profile-preferences-avatar-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mfp-profile-preferences-small-button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #dbe3f0;
    border-radius: 10px;
    color: #475569;
    background: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .mfp-profile-preferences-small-button:hover,
  .mfp-profile-preferences-small-button:focus-visible {
    border-color: rgba(97, 93, 236, .42);
    color: #4f46e5;
    outline: none;
  }
  .mfp-profile-preferences-email {
    padding: 13px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    color: #64748b;
    background: #f8fafc;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .mfp-profile-preferences-section {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .mfp-profile-preferences-label {
    margin: 0;
    color: #64748b;
    font-size: 11.5px;
    font-weight: 750;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .mfp-profile-preferences-currency {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .mfp-profile-preferences-currency-option {
    min-height: 58px;
    padding: 10px 14px;
    border: 1px solid #dbe3f0;
    border-radius: 14px;
    color: #475569;
    background: #fff;
    text-align: left;
    cursor: pointer;
  }
  .mfp-profile-preferences-currency-option strong,
  .mfp-profile-preferences-currency-option span {
    display: block;
    color: inherit;
  }
  .mfp-profile-preferences-currency-option strong {
    margin-bottom: 2px;
    font-size: 15px;
  }
  .mfp-profile-preferences-currency-option span {
    font-size: 12px;
  }
  .mfp-profile-preferences-currency-option.is-selected {
    border-color: #615dec;
    color: #4f46e5;
    background: rgba(97, 93, 236, .07);
    box-shadow: 0 0 0 3px rgba(97, 93, 236, .11);
  }
  .mfp-profile-preferences-hint,
  .mfp-profile-preferences-error {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
  }
  .mfp-profile-preferences-hint { color: #94a3b8; }
  .mfp-profile-preferences-error { color: #dc2626; }
  .mfp-profile-preferences-footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .mfp-profile-preferences-footer-actions {
    display: flex;
    gap: 10px;
  }
  .mfp-profile-preferences-reset {
    border: 0;
    color: #64748b;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .mfp-profile-preferences-reset:hover,
  .mfp-profile-preferences-reset:focus-visible {
    color: #4f46e5;
    outline: none;
  }
  @media (max-width: 520px) {
    .mfp-profile-preferences-avatar-row { align-items: flex-start; }
    .mfp-profile-preferences-footer { align-items: stretch; flex-direction: column; }
    .mfp-profile-preferences-footer-actions { width: 100%; }
    .mfp-profile-preferences-footer-actions .lfs-button { flex: 1; }
  }
`;
