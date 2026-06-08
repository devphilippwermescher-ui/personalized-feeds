export interface LfsButtonOptions {
  label: string;
  id?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  leadingIconHtml?: string;
  extraClassName?: string;
  title?: string;
}

export interface LfsIconButtonOptions {
  id?: string;
  iconHtml: string;
  title?: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  extraClassName?: string;
  dataAttributes?: Record<string, string>;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderLfsButton(opts: LfsButtonOptions): string {
  const {
    label,
    id,
    variant = 'primary',
    disabled = false,
    leadingIconHtml = '',
    extraClassName = '',
    title,
  } = opts;

  return `
    <button
      type="button"
      ${id ? `id="${escapeAttr(id)}"` : ''}
      class="lfs-button lfs-button--${escapeAttr(variant)}${extraClassName ? ` ${escapeAttr(extraClassName)}` : ''}"
      ${title ? `title="${escapeAttr(title)}"` : ''}
      ${disabled ? 'disabled aria-disabled="true"' : ''}>
      ${leadingIconHtml ? `<span class="lfs-button__icon">${leadingIconHtml}</span>` : ''}
      <span>${escapeAttr(label)}</span>
    </button>
  `;
}

export function renderLfsIconButton(opts: LfsIconButtonOptions): string {
  const {
    id,
    iconHtml,
    title,
    variant = 'default',
    disabled = false,
    extraClassName = '',
    dataAttributes = {},
  } = opts;

  const dataAttrs = Object.entries(dataAttributes)
    .map(([key, value]) => `data-${escapeAttr(key)}="${escapeAttr(value)}"`)
    .join(' ');

  return `
    <button
      type="button"
      ${id ? `id="${escapeAttr(id)}"` : ''}
      class="lfs-icon-button lfs-icon-button--${escapeAttr(variant)}${extraClassName ? ` ${escapeAttr(extraClassName)}` : ''}"
      ${title ? `title="${escapeAttr(title)}"` : ''}
      ${dataAttrs}
      ${disabled ? 'disabled aria-disabled="true"' : ''}>
      ${iconHtml}
    </button>
  `;
}
