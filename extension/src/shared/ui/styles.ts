let injected = false;

export function injectSharedStyles(): void {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = SHARED_UI_CSS;
  document.head.appendChild(style);
}

const SHARED_UI_CSS = /* css */ `
  /* ── LFS Design Tokens ── */
  :root {
    --lfs-primary: #615DEC;
    --lfs-primary-dark: #4F46E5;
    --lfs-primary-ring: rgba(97, 93, 236, 0.15);
    --lfs-text: #0f172a;
    --lfs-text-secondary: #475569;
    --lfs-text-muted: #94a3b8;
    --lfs-label: #64748b;
    --lfs-border: rgba(148, 163, 184, 0.30);
    --lfs-border-hover: rgba(148, 163, 184, 0.50);
    --lfs-bg: #ffffff;
    --lfs-bg-subtle: #f8fafc;
    --lfs-bg-elevated: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%);
    --lfs-radius: 12px;
    --lfs-transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* ── Shared Input ── */
  .lfs-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lfa-sidebar .lfs-field__label,
  .lfs-field__label {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--lfs-label);
    padding-left: 2px;
    margin: 0;
  }
  .lfa-sidebar .lfs-field__helper,
  .lfs-field__helper {
    font-size: 12px;
    line-height: 1.4;
    color: var(--lfs-text-muted);
    padding-left: 2px;
    margin-top: 1px;
  }

  .lfa-sidebar input.lfs-input,
  .lfs-input {
    width: 100%;
    min-height: 50px;
    box-sizing: border-box;
    border: 1px solid rgba(203, 213, 225, 0.95) !important;
    border-radius: 16px !important;
    padding: 13px 16px !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    font-family: inherit;
    line-height: 1.5;
    outline: none;
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%) !important;
    color: var(--lfs-text) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.96),
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 10px 24px rgba(15, 23, 42, 0.05) !important;
    transition:
      border-color var(--lfs-transition),
      box-shadow var(--lfs-transition),
      background-color var(--lfs-transition),
      transform var(--lfs-transition);
    -webkit-appearance: none;
    appearance: none;
  }
  .lfa-sidebar input.lfs-input::placeholder,
  .lfs-input::placeholder {
    color: var(--lfs-text-muted);
    font-weight: 400;
  }
  .lfa-sidebar input.lfs-input:hover,
  .lfs-input:hover {
    border-color: rgba(97, 93, 236, 0.32) !important;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.98),
      0 10px 22px rgba(97, 93, 236, 0.08) !important;
  }
  .lfa-sidebar input.lfs-input:focus,
  .lfa-sidebar input.lfs-input:focus-visible,
  .lfs-input:focus {
    border-color: var(--lfs-primary) !important;
    background: #ffffff !important;
    box-shadow:
      0 0 0 4px rgba(97, 93, 236, 0.14),
      0 14px 30px rgba(97, 93, 236, 0.14) !important;
    transform: translateY(-1px);
  }
  .lfa-sidebar input.lfs-input--error,
  .lfs-input--error {
    border-color: #ef4444 !important;
  }
  .lfa-sidebar input.lfs-input--error:focus,
  .lfs-input--error:focus {
    box-shadow: 0 0 0 3.5px rgba(239, 68, 68, 0.12) !important;
  }

  /* ── Shared Dropdown ── */
  .lfs-dropdown {
    position: relative;
  }
  .lfs-dropdown__trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 50px;
    border: 1px solid var(--lfs-border);
    border-radius: 16px;
    padding: 13px 16px;
    font-size: 15px;
    font-weight: 500;
    font-family: inherit;
    line-height: 1.5;
    outline: none;
    background: var(--lfs-bg-elevated);
    color: var(--lfs-text);
    cursor: pointer;
    text-align: left;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      0 1px 2px rgba(15, 23, 42, 0.04);
    transition:
      border-color var(--lfs-transition),
      box-shadow var(--lfs-transition),
      background-color var(--lfs-transition),
      transform var(--lfs-transition);
  }
  .lfs-dropdown__trigger:hover {
    border-color: var(--lfs-border-hover);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.98),
      0 8px 18px rgba(15, 23, 42, 0.05);
  }
  .lfs-dropdown__trigger:focus,
  .lfs-dropdown--open .lfs-dropdown__trigger {
    border-color: var(--lfs-primary);
    background: var(--lfs-bg);
    box-shadow:
      0 0 0 4px var(--lfs-primary-ring),
      0 14px 30px rgba(97, 93, 236, 0.12);
    transform: translateY(-1px);
  }
  .lfs-dropdown__trigger-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lfs-dropdown__trigger-text--placeholder {
    color: var(--lfs-text-muted);
  }
  .lfs-dropdown__chevron {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    color: var(--lfs-label);
    transition: transform var(--lfs-transition);
  }
  .lfs-dropdown--open .lfs-dropdown__chevron {
    transform: rotate(180deg);
  }

  .lfs-dropdown__menu {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--lfs-bg);
    border: 1.5px solid var(--lfs-border);
    border-radius: var(--lfs-radius);
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06);
    animation: lfs-dropdown-in 0.15s ease;
  }
  .lfs-dropdown--open .lfs-dropdown__menu {
    display: block;
  }

  @keyframes lfs-dropdown-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .lfs-dropdown__option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: none;
    background: none;
    border-radius: 8px;
    padding: 9px 10px;
    font-size: 14px;
    font-family: inherit;
    color: var(--lfs-text);
    cursor: pointer;
    text-align: left;
    transition: background var(--lfs-transition);
  }
  .lfs-dropdown__option:hover {
    background: var(--lfs-bg-subtle);
  }
  .lfs-dropdown__option--selected {
    color: var(--lfs-primary);
    font-weight: 600;
    background: rgba(97, 93, 236, 0.06);
  }
  .lfs-dropdown__option--selected:hover {
    background: rgba(97, 93, 236, 0.10);
  }
  .lfs-dropdown__check {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    color: var(--lfs-primary);
  }
  .lfs-dropdown__check--hidden {
    visibility: hidden;
  }

  /* ── Shared Buttons ── */
  .lfs-button {
    min-height: 42px;
    padding: 0 16px;
    border: none;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: transform var(--lfs-transition), box-shadow var(--lfs-transition), opacity var(--lfs-transition), background var(--lfs-transition);
  }
  .lfs-button--primary {
    background: linear-gradient(135deg, var(--lfs-primary) 0%, #5a54ea 100%);
    color: #fff;
    box-shadow: 0 12px 24px rgba(97, 93, 236, 0.18);
  }
  .lfs-button--primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 28px rgba(97, 93, 236, 0.24);
  }
  .lfs-button--secondary {
    background: #fff;
    color: var(--lfs-text-secondary);
    border: 1px solid rgba(203, 213, 225, 0.9);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  }
  .lfs-button--secondary:hover {
    transform: translateY(-1px);
    border-color: rgba(148, 163, 184, 0.55);
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  }
  .lfs-button--danger {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: #fff;
    box-shadow: 0 12px 24px rgba(239, 68, 68, 0.18);
  }
  .lfs-button--danger:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 28px rgba(239, 68, 68, 0.24);
  }
  .lfs-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
  .lfs-button__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .lfs-icon-button {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 8px;
    border: 1px solid rgba(216, 224, 239, 0.95);
    background: #fff;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
    transition: transform var(--lfs-transition), box-shadow var(--lfs-transition), color var(--lfs-transition), border-color var(--lfs-transition);
  }
  .lfs-icon-button:hover {
    transform: translateY(-1px);
    border-color: rgba(97, 93, 236, 0.32);
    color: var(--lfs-primary);
    box-shadow: 0 8px 18px rgba(97, 93, 236, 0.10);
  }
  .lfs-icon-button svg {
    width: 13px;
    height: 13px;
  }
  .lfs-icon-button--danger {
    color: #ef4444;
    background: #fff7f7;
    border-color: #fecdd3;
  }
  .lfs-icon-button--danger:hover {
    color: #dc2626;
    border-color: #fda4af;
    box-shadow: 0 8px 18px rgba(239, 68, 68, 0.10);
  }
  .lfs-icon-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  /* ── Shared Modal ── */
  .lfs-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100001;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .lfs-modal {
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: lfs-modal-in 0.2s ease;
  }
  .lfs-modal--md {
    width: min(420px, calc(100vw - 32px));
  }
  .lfs-modal--lg {
    width: min(720px, calc(100vw - 32px));
  }
  @keyframes lfs-modal-in {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .lfs-modal__header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid #e8edf5;
  }
  .lfs-modal__header--centered {
    justify-content: center;
  }
  .lfs-modal__header--icon-only {
    min-height: 0;
    padding: 14px 20px 0;
    border-bottom: none;
  }
  .lfs-modal__title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .lfs-modal__title {
    margin: 0;
    font-size: 16px;
    line-height: 1.2;
    font-weight: 600;
    color: #1a1a1a;
  }
  .lfs-modal__title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #2f3447;
  }
  .lfs-modal__close {
    width: auto;
    height: auto;
    border-radius: 0;
    border: none;
    background: none;
    color: #9ca3af;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    transition: background var(--lfs-transition), color var(--lfs-transition);
  }
  .lfs-modal__close svg {
    width: 24px;
    height: 24px;
  }
  .lfs-modal__header--centered .lfs-modal__close {
    position: absolute;
    right: 14px;
    top: 12px;
  }
  .lfs-modal__header--icon-only .lfs-modal__close {
    top: 14px;
  }
  .lfs-modal__close:hover {
    background: none;
    color: #4b5563;
  }
  .lfs-modal__body {
    padding: 12px 20px;
    overflow: auto;
  }
  .lfs-modal__header--icon-only + .lfs-modal__body {
    padding-top: 8px;
  }
  .lfs-modal__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    border-top: 1px solid #e8edf5;
    background: #fff;
  }

  .lfa-feed-confirm-footer {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .lfa-feed-confirm-footer .lfs-button {
    min-width: 146px;
    min-height: 40px;
    padding: 0 14px;
  }
  .lfa-feed-confirm-content {
    padding: 10px 0 4px;
  }
  .lfa-feed-confirm-text {
    margin: 0 0 8px;
    font-size: 20px;
    line-height: 1.45;
    font-weight: 600;
    color: #111827;
  }
  .lfa-feed-confirm-subtext {
    margin: 0;
    font-size: 16px;
    line-height: 1.6;
    font-weight: 400;
    color: #4b5563;
  }
  .lfa-feed-confirm-cancel-btn {
    flex: 0 0 auto;
  }
  .lfa-feed-delete-confirm-btn.lfs-button--danger {
    flex: 0 0 auto;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    box-shadow: 0 12px 24px rgba(239, 68, 68, 0.2);
  }
  .lfa-feed-delete-confirm-btn.lfs-button--danger:hover {
    box-shadow: 0 16px 28px rgba(239, 68, 68, 0.24);
  }
`;
