export interface LfsDropdownOption {
  value: string;
  label: string;
}

export interface LfsDropdownOptions {
  id: string;
  label?: string;
  options: LfsDropdownOption[];
  selectedValue?: string;
  placeholder?: string;
  helper?: string;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const CHEVRON_SVG = `<svg class="lfs-dropdown__chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>`;

const CHECK_SVG = `<svg class="lfs-dropdown__check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3.5 8.5L6.5 11.5L12.5 4.5"/></svg>`;

export function renderLfsDropdown(opts: LfsDropdownOptions): string {
  const {
    id,
    label,
    options,
    selectedValue = '',
    placeholder = 'Select...',
    helper,
  } = opts;

  const selectedOption = options.find((o) => o.value === selectedValue);
  const displayText = selectedOption?.label || '';
  const isPlaceholder = !selectedOption;

  const optionsHtml = options
    .map((opt) => {
      const selected = opt.value === selectedValue;
      return `
        <button type="button"
          class="lfs-dropdown__option${selected ? ' lfs-dropdown__option--selected' : ''}"
          data-lfs-dropdown-value="${escapeAttr(opt.value)}"
          data-lfs-dropdown-id="${escapeAttr(id)}">
          <span class="lfs-dropdown__check${selected ? '' : ' lfs-dropdown__check--hidden'}">${CHECK_SVG}</span>
          <span>${escapeAttr(opt.label)}</span>
        </button>`;
    })
    .join('');

  const labelHtml = label
    ? `<span class="lfs-field__label">${escapeAttr(label)}</span>`
    : '';

  const helperHtml = helper
    ? `<span class="lfs-field__helper">${escapeAttr(helper)}</span>`
    : '';

  return `
    <div class="lfs-field">
      ${labelHtml}
      <div class="lfs-dropdown" data-lfs-dropdown="${escapeAttr(id)}">
        <input type="hidden" id="${escapeAttr(id)}" value="${escapeAttr(selectedValue)}" />
        <button type="button" class="lfs-dropdown__trigger" data-lfs-dropdown-trigger="${escapeAttr(id)}">
          <span class="lfs-dropdown__trigger-text${isPlaceholder ? ' lfs-dropdown__trigger-text--placeholder' : ''}">
            ${isPlaceholder ? escapeAttr(placeholder) : escapeAttr(displayText)}
          </span>
          ${CHEVRON_SVG}
        </button>
        <div class="lfs-dropdown__menu">
          ${optionsHtml}
        </div>
      </div>
      ${helperHtml}
    </div>
  `;
}

/**
 * Binds click events for all LFS dropdowns within a container.
 * Call once after inserting dropdown HTML into the DOM.
 */
export function bindLfsDropdowns(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('[data-lfs-dropdown-trigger]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdownId = trigger.getAttribute('data-lfs-dropdown-trigger')!;
      const wrapper = container.querySelector<HTMLElement>(`[data-lfs-dropdown="${dropdownId}"]`);
      if (!wrapper) return;

      const isOpen = wrapper.classList.contains('lfs-dropdown--open');

      container.querySelectorAll('.lfs-dropdown--open').forEach((el) => {
        el.classList.remove('lfs-dropdown--open');
      });

      if (!isOpen) {
        wrapper.classList.add('lfs-dropdown--open');
      }
    });
  });

  container.querySelectorAll<HTMLElement>('[data-lfs-dropdown-value]').forEach((optBtn) => {
    optBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdownId = optBtn.getAttribute('data-lfs-dropdown-id')!;
      const newValue = optBtn.getAttribute('data-lfs-dropdown-value')!;
      const wrapper = container.querySelector<HTMLElement>(`[data-lfs-dropdown="${dropdownId}"]`);
      if (!wrapper) return;

      const hiddenInput = wrapper.querySelector<HTMLInputElement>(`#${CSS.escape(dropdownId)}`);
      if (hiddenInput) {
        hiddenInput.value = newValue;
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const triggerText = wrapper.querySelector('.lfs-dropdown__trigger-text');
      if (triggerText) {
        triggerText.textContent = optBtn.querySelector('span:last-child')?.textContent || newValue;
        triggerText.classList.remove('lfs-dropdown__trigger-text--placeholder');
      }

      wrapper.querySelectorAll('.lfs-dropdown__option').forEach((opt) => {
        const isSelected = opt.getAttribute('data-lfs-dropdown-value') === newValue;
        opt.classList.toggle('lfs-dropdown__option--selected', isSelected);
        const check = opt.querySelector('.lfs-dropdown__check');
        check?.classList.toggle('lfs-dropdown__check--hidden', !isSelected);
      });

      wrapper.classList.remove('lfs-dropdown--open');
    });
  });

  document.addEventListener('click', () => {
    container.querySelectorAll('.lfs-dropdown--open').forEach((el) => {
      el.classList.remove('lfs-dropdown--open');
    });
  });
}
