import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CreateFeedModal from '../CreateFeedModal';

describe('CreateFeedModal shared shell compatibility', () => {
  it('preserves the dashboard modal classes and form controls', () => {
    const markup = renderToStaticMarkup(
      createElement(CreateFeedModal, {
        onClose: vi.fn(),
        onCreate: vi.fn(),
      })
    );

    expect(markup).toContain('class="modal-overlay"');
    expect(markup).toContain('class="modal"');
    expect(markup).toContain('class="modal-header"');
    expect(markup).toContain('class="modal-body"');
    expect(markup).toContain('class="modal-footer"');
    expect(markup).toContain('data-modal-variant="form"');
    expect(markup).toContain('placeholder="e.g. Prospects, Industry Leaders..."');
    expect(markup.match(/class="color-option/g)).toHaveLength(8);
  });
});
