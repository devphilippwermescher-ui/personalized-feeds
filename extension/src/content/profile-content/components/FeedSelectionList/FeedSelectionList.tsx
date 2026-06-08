import { createPortal } from 'react-dom';
import { CONTENT_COPY } from '../../../shared/copy';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export function FeedSelectionList() {
  const modal = (
    <div className="lfs-modal-overlay pf-feed-modal-overlay" id="pf-feed-modal-overlay" style={{ display: 'none' }}>
      <div className="lfs-modal lfs-modal--md pf-feed-modal" id="pf-feed-modal">
        <div className="lfs-modal__header pf-feed-modal-header">
          <h3 className="lfs-modal__title">{CONTENT_COPY.profile.addToFeedTitle}</h3>
          <button className="lfs-modal__close pf-feed-modal-close" id="pf-feed-modal-close" aria-label={CONTENT_COPY.common.close}>
            <CloseIcon />
          </button>
        </div>
        <div className="lfs-modal__body pf-feed-modal-body" id="pf-feed-modal-body">
          <div className="pf-feed-modal-loading">{CONTENT_COPY.profile.loadingFeeds}</div>
        </div>
        <div className="lfs-modal__footer pf-feed-modal-footer">
          <button className="pf-feed-modal-create" id="pf-feed-modal-create">
            {CONTENT_COPY.profile.createFeedAction}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
