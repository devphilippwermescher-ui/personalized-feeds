export interface LfsInputOptions {
  id: string;
  label?: string;
  value?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'url' | 'tel' | 'number';
  helper?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderLfsInput(opts: LfsInputOptions): string {
  const {
    id,
    label,
    value = '',
    placeholder = '',
    type = 'text',
    helper,
    error,
    disabled = false,
    required = false,
  } = opts;

  const errorClass = error ? ' lfs-input--error' : '';
  const attrs = [
    `id="${escapeAttr(id)}"`,
    `class="lfs-input${errorClass}"`,
    `type="${escapeAttr(type)}"`,
    `value="${escapeAttr(value)}"`,
    placeholder ? `placeholder="${escapeAttr(placeholder)}"` : '',
    disabled ? 'disabled' : '',
    required ? 'required' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const labelHtml = label
    ? `<span class="lfs-field__label">${escapeAttr(label)}</span>`
    : '';

  const bottomText = error
    ? `<span class="lfs-field__helper" style="color:#ef4444">${escapeAttr(error)}</span>`
    : helper
      ? `<span class="lfs-field__helper">${escapeAttr(helper)}</span>`
      : '';

  return `
    <label class="lfs-field">
      ${labelHtml}
      <input ${attrs} />
      ${bottomText}
    </label>
  `;
}
