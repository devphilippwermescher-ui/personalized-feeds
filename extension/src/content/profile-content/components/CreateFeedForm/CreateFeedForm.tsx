import { createPortal } from 'react-dom';
import { CONTENT_COPY } from '../../../shared/copy';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

const FEED_COLORS = ['#615DEC', '#2563EB', '#059669', '#DC2626', '#D97706', '#7C3AED'];

export function CreateFeedForm() {
  const modal = (
    <div className="lfs-modal-overlay pf-create-feed-overlay" id="pf-create-feed-overlay" style={{ display: 'none' }}>
      <div className="lfs-modal lfs-modal--md pf-create-feed-modal">
        <div className="lfs-modal__header pf-feed-modal-header">
          <h3 className="lfs-modal__title">{CONTENT_COPY.profile.createFeedTitle}</h3>
          <button className="lfs-modal__close pf-feed-modal-close" id="pf-create-feed-close" aria-label={CONTENT_COPY.common.close}>
            <CloseIcon />
          </button>
        </div>
        <div className="pf-create-feed-body">
          <input
            type="text"
            className="pf-create-feed-input"
            id="pf-create-feed-name"
            placeholder={CONTENT_COPY.profile.createFeedNamePlaceholder}
          />
          <input
            type="text"
            className="pf-create-feed-input"
            id="pf-create-feed-desc"
            placeholder={CONTENT_COPY.profile.createFeedDescriptionPlaceholder}
          />
          <div className="pf-create-feed-colors" id="pf-create-feed-colors">
            {FEED_COLORS.map((color, index) => (
              <span
                key={color}
                className={`pf-color-option${index === 0 ? ' active' : ''}`}
                data-color={color}
                style={{ background: color }}
              ></span>
            ))}
          </div>
          <button className="pf-create-feed-submit" id="pf-create-feed-submit">
            {CONTENT_COPY.profile.createFeedSubmit}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
