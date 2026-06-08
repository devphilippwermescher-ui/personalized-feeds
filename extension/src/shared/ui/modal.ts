export interface LfsModalOptions {
  title: string;
  bodyHtml: string;
  footerHtml?: string;
  size?: 'md' | 'lg';
  titleIconHtml?: string;
  centeredTitle?: boolean;
  className?: string;
  bodyClassName?: string;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderLfsModal(opts: LfsModalOptions): string {
  const {
    title,
    bodyHtml,
    footerHtml = '',
    size = 'md',
    titleIconHtml = '',
    centeredTitle = false,
    className = '',
    bodyClassName = '',
  } = opts;
  const hasTitle = title.trim().length > 0 || Boolean(titleIconHtml);

  return `
    <div class="lfs-modal-overlay">
      <div class="lfs-modal lfs-modal--${escapeAttr(size)}${className ? ` ${escapeAttr(className)}` : ''}">
        <div class="lfs-modal__header${centeredTitle ? ' lfs-modal__header--centered' : ''}${!hasTitle ? ' lfs-modal__header--icon-only' : ''}">
          <div class="lfs-modal__title-wrap">
            ${titleIconHtml ? `<span class="lfs-modal__title-icon">${titleIconHtml}</span>` : ''}
            ${hasTitle ? `<h3 class="lfs-modal__title">${escapeAttr(title)}</h3>` : ''}
          </div>
          <button class="lfs-modal__close" data-lfs-modal-close type="button" aria-label="Close modal">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
        <div class="lfs-modal__body${bodyClassName ? ` ${escapeAttr(bodyClassName)}` : ''}">
          ${bodyHtml}
        </div>
        ${footerHtml ? `<div class="lfs-modal__footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;
}
