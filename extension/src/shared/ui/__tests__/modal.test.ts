import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from 'shared/ui/modal';

describe('shared Modal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders supplied legacy classes and variant metadata without owning feature content', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    flushSync(() => {
      root.render(
        createElement(
          Modal,
          {
            title: 'Example modal',
            variant: 'form',
            tone: 'primary',
            size: 'lg',
            onClose: () => undefined,
            classNames: {
              overlay: 'legacy-overlay',
              dialog: 'legacy-dialog',
              body: 'legacy-body',
            },
          },
          createElement('span', { id: 'feature-content' }, 'Feature content')
        )
      );
    });

    const overlay = document.querySelector<HTMLElement>('.legacy-overlay');
    expect(overlay?.dataset.modalVariant).toBe('form');
    expect(overlay?.dataset.modalTone).toBe('primary');
    expect(overlay?.dataset.modalSize).toBe('lg');
    expect(document.querySelector('.legacy-dialog .legacy-body #feature-content')?.textContent).toBe('Feature content');

    root.unmount();
  });

  it('reports close reasons for backdrop, Escape, and the close button', () => {
    const onClose = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    flushSync(() => {
      root.render(createElement(Modal, { title: 'Closable', onClose }, 'Body'));
    });

    const overlay = document.querySelector<HTMLElement>('.mfp-modal-overlay');
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.querySelector<HTMLButtonElement>('.mfp-modal__close')?.click();

    expect(onClose).toHaveBeenNthCalledWith(1, 'backdrop');
    expect(onClose).toHaveBeenNthCalledWith(2, 'escape');
    expect(onClose).toHaveBeenNthCalledWith(3, 'button');

    root.unmount();
  });
});
