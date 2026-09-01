import type { ChangeEventHandler, CSSProperties, ReactNode, Ref } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, type ModalTone, type ModalVariant } from 'shared/ui/modal';
import type { LfsDropdownOption } from './dropdown';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface LfsButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  leadingIcon?: ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
}

export function LfsButton({
  label,
  variant = 'primary',
  disabled = false,
  leadingIcon,
  className,
  title,
  onClick,
  type = 'button',
}: LfsButtonProps) {
  return (
    <button
      type={type}
      className={cx(`lfs-button lfs-button--${variant}`, className)}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {leadingIcon ? <span className="lfs-button__icon">{leadingIcon}</span> : null}
      <span>{label}</span>
    </button>
  );
}

interface LfsIconButtonProps {
  icon: ReactNode;
  title?: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export function LfsIconButton({
  icon,
  title,
  variant = 'default',
  disabled = false,
  className,
  onClick,
}: LfsIconButtonProps) {
  return (
    <button
      type="button"
      className={cx(`lfs-icon-button lfs-icon-button--${variant}`, className)}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

interface LfsInputFieldProps {
  id?: string;
  label?: string;
  helper?: string;
  value: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  inputRef?: Ref<HTMLInputElement>;
}

interface LfsDropdownProps {
  label?: string;
  helper?: string;
  value?: string;
  options: LfsDropdownOption[];
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
}

export function LfsInputField({
  id,
  label,
  helper,
  value,
  placeholder,
  className,
  inputClassName,
  onChange,
  inputRef,
}: LfsInputFieldProps) {
  return (
    <label className={cx('lfs-field', className)}>
      {label ? <span className="lfs-field__label">{label}</span> : null}
      <input
        id={id}
        ref={inputRef}
        className={cx('lfs-input', inputClassName)}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
      {helper ? <span className="lfs-field__helper">{helper}</span> : null}
    </label>
  );
}

export function LfsDropdown({
  label,
  helper,
  value = '',
  options,
  placeholder = 'Select...',
  className,
  onChange,
}: LfsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const selectedOption = options.find((option) => option.value === value);

  const positionMenu = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const viewportPadding = 12;
    const menuHeight = Math.min(menu.scrollHeight || 0, 200);
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openUpward = availableBelow < menuHeight && availableAbove > availableBelow;
    const top = openUpward
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - menuHeight);

    setMenuStyle({
      position: 'fixed',
      top,
      left: rect.left,
      right: 'auto',
      width: rect.width,
      display: 'block',
      visibility: 'visible',
      boxSizing: 'border-box',
      zIndex: 100002,
    });
  };

  useEffect(() => {
    if (!open) {
      setMenuStyle(undefined);
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) {
      positionMenu();
    }
  }, [open, options.length]);

  const menu = (
    <div
      ref={menuRef}
      id={id}
      className="lfs-dropdown__menu"
      role="listbox"
      style={menuStyle || { position: 'fixed', top: 0, left: 0, width: 0, display: 'block', visibility: 'hidden' }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cx('lfs-dropdown__option', selected && 'lfs-dropdown__option--selected')}
            role="option"
            aria-selected={selected}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
          >
            <span className={cx('lfs-dropdown__check', !selected && 'lfs-dropdown__check--hidden')}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
              </svg>
            </span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={cx('lfs-field', className)}>
      {label ? <span className="lfs-field__label">{label}</span> : null}
      <div ref={wrapperRef} className={cx('lfs-dropdown', open && 'lfs-dropdown--open')}>
        <button
          ref={triggerRef}
          type="button"
          className="lfs-dropdown__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((current) => !current)}
        >
          <span
            className={cx('lfs-dropdown__trigger-text', !selectedOption && 'lfs-dropdown__trigger-text--placeholder')}
          >
            {selectedOption?.label || placeholder}
          </span>
          <svg
            className="lfs-dropdown__chevron"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>
      {open ? createPortal(menu, document.body) : null}
      {helper ? <span className="lfs-field__helper">{helper}</span> : null}
    </div>
  );
}

interface LfsModalProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  titleIcon?: ReactNode;
  centeredTitle?: boolean;
  className?: string;
  bodyClassName?: string;
  variant?: ModalVariant;
  tone?: ModalTone;
  onClose: () => void;
}

export function LfsModal({
  title,
  children,
  footer,
  size = 'md',
  titleIcon,
  centeredTitle = false,
  className,
  bodyClassName,
  variant,
  tone,
  onClose,
}: LfsModalProps) {
  const hasTitle = title.trim().length > 0 || Boolean(titleIcon);

  return (
    <Modal
      title={title}
      variant={variant}
      tone={tone}
      size={size}
      onClose={onClose}
      classNames={{
        overlay: 'lfs-modal-overlay',
        dialog: 'lfs-modal',
        body: 'lfs-modal__body',
        footer: 'lfs-modal__footer',
      }}
      dialogClassName={cx(`lfs-modal--${size}`, className)}
      bodyClassName={bodyClassName}
      footer={footer}
      header={
        <div
          className={cx(
            'lfs-modal__header',
            centeredTitle && 'lfs-modal__header--centered',
            !hasTitle && 'lfs-modal__header--icon-only'
          )}
        >
          <div className="lfs-modal__title-wrap">
            {titleIcon ? <span className="lfs-modal__title-icon">{titleIcon}</span> : null}
            {hasTitle ? <h3 className="lfs-modal__title">{title}</h3> : null}
          </div>
          <button className="lfs-modal__close" type="button" aria-label="Close modal" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      }
    >
      {children}
    </Modal>
  );
}
