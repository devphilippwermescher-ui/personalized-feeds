import React, { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type ModalCloseReason = 'button' | 'backdrop' | 'escape';
export type ModalVariant = 'default' | 'form' | 'confirm' | 'search' | 'tabs' | 'success' | 'billing';
export type ModalTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalClassNames {
  overlay: string;
  dialog: string;
  header: string;
  titleWrap: string;
  title: string;
  titleIcon: string;
  close: string;
  body: string;
  footer: string;
}

export interface ModalProps {
  children?: ReactNode;
  bodyHtml?: string;
  onClose: (reason: ModalCloseReason) => void;
  title?: ReactNode;
  titleIcon?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  closeIcon?: ReactNode;
  closeLabel?: string;
  variant?: ModalVariant;
  tone?: ModalTone;
  size?: ModalSize;
  open?: boolean;
  keepMounted?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  centeredTitle?: boolean;
  overlayId?: string;
  dialogId?: string;
  titleId?: string;
  bodyId?: string;
  closeButtonId?: string;
  overlayClassName?: string;
  dialogClassName?: string;
  headerClassName?: string;
  titleWrapClassName?: string;
  titleClassName?: string;
  titleIconClassName?: string;
  closeClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  classNames?: Partial<ModalClassNames>;
  overlayStyle?: CSSProperties;
  dialogAs?: 'div' | 'section';
  titleAs?: 'h2' | 'h3';
  portalTarget?: Element | DocumentFragment | null;
}

const DEFAULT_CLASS_NAMES: ModalClassNames = {
  overlay: 'mfp-modal-overlay',
  dialog: 'mfp-modal',
  header: 'mfp-modal__header',
  titleWrap: 'mfp-modal__title-wrap',
  title: 'mfp-modal__title',
  titleIcon: 'mfp-modal__title-icon',
  close: 'mfp-modal__close',
  body: 'mfp-modal__body',
  footer: 'mfp-modal__footer',
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function DefaultCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export function Modal({
  children,
  bodyHtml,
  onClose,
  title,
  titleIcon,
  footer,
  header,
  closeIcon = <DefaultCloseIcon />,
  closeLabel = 'Close modal',
  variant = 'default',
  tone = 'neutral',
  size = 'md',
  open = true,
  keepMounted = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  centeredTitle = false,
  overlayId,
  dialogId,
  titleId,
  bodyId,
  closeButtonId,
  overlayClassName,
  dialogClassName,
  headerClassName,
  titleWrapClassName,
  titleClassName,
  titleIconClassName,
  closeClassName,
  bodyClassName,
  footerClassName,
  classNames: classNameOverrides,
  overlayStyle,
  dialogAs = 'div',
  titleAs = 'h3',
  portalTarget,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose('escape');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose, open]);

  if (!open && !keepMounted) {
    return null;
  }

  const classes = { ...DEFAULT_CLASS_NAMES, ...classNameOverrides };
  const hasTitle = title !== undefined && title !== null && title !== '';
  const Dialog = dialogAs;
  const Title = titleAs;
  const defaultHeader = (
    <div className={cx(classes.header, headerClassName, centeredTitle && `${classes.header}--centered`)}>
      <div className={cx(classes.titleWrap, titleWrapClassName)}>
        {titleIcon ? <span className={cx(classes.titleIcon, titleIconClassName)}>{titleIcon}</span> : null}
        {hasTitle ? (
          <Title id={titleId} className={cx(classes.title, titleClassName)}>
            {title}
          </Title>
        ) : null}
      </div>
      {showCloseButton ? (
        <button
          id={closeButtonId}
          className={cx(classes.close, closeClassName)}
          type="button"
          aria-label={closeLabel}
          onClick={() => onClose('button')}
        >
          {closeIcon}
        </button>
      ) : null}
    </div>
  );
  const content = (
    <div
      id={overlayId}
      className={cx(classes.overlay, overlayClassName)}
      data-modal-variant={variant}
      data-modal-tone={tone}
      data-modal-size={size}
      style={{ ...overlayStyle, ...(!open ? { display: 'none' } : undefined) }}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose('backdrop');
        }
      }}
    >
      <Dialog
        id={dialogId}
        className={cx(classes.dialog, dialogClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle && titleId ? titleId : undefined}
        aria-label={!hasTitle ? closeLabel.replace(/^Close\s+/i, '') || 'Modal' : undefined}
      >
        {header === undefined ? defaultHeader : header}
        {bodyHtml === undefined ? (
          <div id={bodyId} className={cx(classes.body, bodyClassName)}>
            {children}
          </div>
        ) : (
          <div id={bodyId} className={cx(classes.body, bodyClassName)} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        )}
        {footer ? <div className={cx(classes.footer, footerClassName)}>{footer}</div> : null}
      </Dialog>
    </div>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
}
