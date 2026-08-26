import { CONTENT_COPY, getMemberCountLabel } from './copy';

export const PROFILE_FEED_MODAL_COLORS = ['#615DEC', '#2563EB', '#059669', '#DC2626', '#D97706', '#7C3AED'] as const;

const FEED_MODAL_OVERLAY_ID = 'pf-feed-modal-overlay';
const CREATE_FEED_OVERLAY_ID = 'pf-create-feed-overlay';
export type ProfileFeedModalContext = 'profile' | 'post';

interface BaseModalOptions {
  overlayId: string;
  overlayClassName: string;
  modalId?: string;
  modalClassName: string;
  title: string;
  closeButtonId: string;
  body: string;
  footer?: string;
}

interface FeedOptionRenderOptions {
  id: string;
  name: string;
  color?: string;
  memberCount?: number;
  isMember?: boolean;
  element?: 'button' | 'div';
}

interface CreateFeedModalElements {
  overlay: HTMLDivElement;
  nameInput: HTMLInputElement;
  descriptionInput: HTMLInputElement | null;
  submitButton: HTMLButtonElement;
}

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function closeIcon(): string {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
    </svg>
  `;
}

function renderBaseModal({
  overlayId,
  overlayClassName,
  modalId,
  modalClassName,
  title,
  closeButtonId,
  body,
  footer,
}: BaseModalOptions): string {
  return `
    <div class="lfs-modal-overlay ${overlayClassName}" id="${overlayId}" style="display: none;">
      <div class="lfs-modal lfs-modal--md ${modalClassName}"${modalId ? ` id="${modalId}"` : ''}>
        <div class="lfs-modal__header pf-feed-modal-header">
          <h3 class="lfs-modal__title">${title}</h3>
          <button class="lfs-modal__close pf-feed-modal-close" id="${closeButtonId}" aria-label="${CONTENT_COPY.common.close}">
            ${closeIcon()}
          </button>
        </div>
        ${body}
        ${footer || ''}
      </div>
    </div>
  `;
}

function renderFeedSelectionModal(): string {
  return renderBaseModal({
    overlayId: FEED_MODAL_OVERLAY_ID,
    overlayClassName: 'pf-feed-modal-overlay',
    modalId: 'pf-feed-modal',
    modalClassName: 'pf-feed-modal',
    title: CONTENT_COPY.profile.addToFeedTitle,
    closeButtonId: 'pf-feed-modal-close',
    body: `
      <div class="lfs-modal__body pf-feed-modal-body" id="pf-feed-modal-body">
        ${renderFeedModalLoading(CONTENT_COPY.profile.loadingFeeds, true)}
      </div>
    `,
    footer: `
      <div class="lfs-modal__footer pf-feed-modal-footer">
        <button class="pf-feed-modal-create" id="pf-feed-modal-create">
          ${CONTENT_COPY.profile.createFeedAction}
        </button>
      </div>
    `,
  });
}

function renderCreateFeedModal(): string {
  return renderBaseModal({
    overlayId: CREATE_FEED_OVERLAY_ID,
    overlayClassName: 'pf-create-feed-overlay',
    modalClassName: 'pf-create-feed-modal',
    title: CONTENT_COPY.profile.createFeedTitle,
    closeButtonId: 'pf-create-feed-close',
    body: `
      <div class="pf-create-feed-body">
        <input
          type="text"
          class="pf-create-feed-input"
          id="pf-create-feed-name"
          placeholder="${CONTENT_COPY.profile.createFeedNamePlaceholder}"
        />
        <!--
          Description is intentionally hidden for now. Keep this field in the
          template so it can be restored without rebuilding the modal flow.
          <input
            type="text"
            class="pf-create-feed-input"
            id="pf-create-feed-desc"
            placeholder="${CONTENT_COPY.profile.createFeedDescriptionPlaceholder}"
          />
        -->
        <div class="pf-create-feed-colors" id="pf-create-feed-colors">
          ${PROFILE_FEED_MODAL_COLORS.map((color, index) => `
            <span
              class="pf-color-option${index === 0 ? ' active' : ''}"
              data-color="${color}"
              style="background: ${color}; color: ${color}"
            ></span>
          `).join('')}
        </div>
        <button class="pf-create-feed-submit" id="pf-create-feed-submit">
          ${CONTENT_COPY.profile.createFeedSubmit}
        </button>
      </div>
    `,
  });
}

function bindOverlayClose(overlay: HTMLElement, closeSelector: string): void {
  if (overlay.dataset.profileFeedModalCloseBound === 'true') {
    return;
  }

  overlay.querySelector(closeSelector)?.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.style.display = 'none';
    }
  });
  overlay.dataset.profileFeedModalCloseBound = 'true';
}

export function ensureProfileFeedModals(): void {
  if (!document.getElementById(FEED_MODAL_OVERLAY_ID)) {
    document.body.insertAdjacentHTML('beforeend', renderFeedSelectionModal());
  }
  if (!document.getElementById(CREATE_FEED_OVERLAY_ID)) {
    document.body.insertAdjacentHTML('beforeend', renderCreateFeedModal());
  }

  const feedOverlay = document.getElementById(FEED_MODAL_OVERLAY_ID);
  const createOverlay = document.getElementById(CREATE_FEED_OVERLAY_ID);
  if (feedOverlay) {
    bindOverlayClose(feedOverlay, '#pf-feed-modal-close');
  }
  if (createOverlay) {
    bindOverlayClose(createOverlay, '#pf-create-feed-close');
  }
}

export function getFeedModalOverlay(): HTMLDivElement | null {
  return document.getElementById(FEED_MODAL_OVERLAY_ID) as HTMLDivElement | null;
}

export function getFeedModalBody(): HTMLElement | null {
  return document.getElementById('pf-feed-modal-body');
}

export function getCreateFeedModalElements(): CreateFeedModalElements | null {
  const overlay = document.getElementById(CREATE_FEED_OVERLAY_ID) as HTMLDivElement | null;
  const nameInput = document.getElementById('pf-create-feed-name') as HTMLInputElement | null;
  const descriptionInput = document.getElementById('pf-create-feed-desc') as HTMLInputElement | null;
  const submitButton = document.getElementById('pf-create-feed-submit') as HTMLButtonElement | null;

  if (!overlay || !nameInput || !submitButton) {
    return null;
  }

  return {
    overlay,
    nameInput,
    descriptionInput,
    submitButton,
  };
}

export function setProfileFeedModalContext(overlay: HTMLElement | null, context: ProfileFeedModalContext): void {
  if (overlay) {
    overlay.dataset.feedModalContext = context;
  }
}

export function renderFeedModalLoading(message: string, showSpinner = false): string {
  return `
    <div class="pf-feed-modal-loading">
      ${showSpinner ? '<div class="pf-feed-modal-loading-spinner pf-inline-spinner" aria-hidden="true"></div>' : ''}
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

export function renderFeedModalEmpty(title: string, hint: string): string {
  return `
    <div class="pf-feed-modal-empty">
      <div>${escapeHtml(title)}</div>
      <div class="pf-feed-modal-hint">${escapeHtml(hint)}</div>
    </div>
  `;
}

export function renderFeedModalOption({
  id,
  name,
  color,
  memberCount,
  isMember = false,
  element = 'div',
}: FeedOptionRenderOptions): string {
  const tag = element;
  const roleAttributes = tag === 'button'
    ? `type="button" ${isMember ? 'disabled' : ''}`
    : `${isMember ? '' : 'role="button" tabindex="0"'}`;

  return `
    <${tag}
      class="pf-feed-option${isMember ? ' already-added' : ''}"
      data-feed-id="${escapeHtml(id)}"
      data-feed-name="${escapeHtml(name)}"
      ${roleAttributes}
    >
      <span class="pf-feed-option-left">
        <span class="pf-feed-option-dot" style="background:${escapeHtml(color || '#615DEC')}"></span>
        <span class="pf-feed-option-name">${escapeHtml(name)}</span>
        <span class="pf-feed-option-count">${getMemberCountLabel(memberCount ?? 0)}</span>
      </span>
      <span class="pf-feed-option-status">
        ${isMember ? '<span class="pf-feed-option-check">&#10003;</span>' : ''}
      </span>
    </${tag}>
  `;
}

export function resetCreateFeedModalFields(overlay: HTMLElement): void {
  const elements = getCreateFeedModalElements();
  if (!elements) {
    return;
  }

  elements.nameInput.value = '';
  elements.nameInput.disabled = false;
  if (elements.descriptionInput) {
    elements.descriptionInput.value = '';
    elements.descriptionInput.disabled = false;
  }
  elements.submitButton.disabled = false;
  elements.submitButton.textContent = CONTENT_COPY.profile.createFeedSubmit;

  overlay.querySelectorAll<HTMLElement>('.pf-color-option').forEach((button, index) => {
    button.classList.toggle('active', index === 0);
  });
}

export function getSelectedCreateFeedColor(): string {
  const activeColor = document.querySelector('.pf-color-option.active') as HTMLElement | null;
  return activeColor?.getAttribute('data-color') || PROFILE_FEED_MODAL_COLORS[0];
}

export const PROFILE_FEED_MODALS_CSS = `
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

  .pf-feed-modal-empty {
    padding: 22px 10px 26px;
    text-align: center;
    color: #6b7280;
    font-size: 14px;
    line-height: 1.45;
  }

  .pf-feed-modal-hint {
    color: #9ca3af;
    font-size: 13px;
    margin-top: 6px;
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
    width: 100%;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: left;
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
    min-width: 0;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
