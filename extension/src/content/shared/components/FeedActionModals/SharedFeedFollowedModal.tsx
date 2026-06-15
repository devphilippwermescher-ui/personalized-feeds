import { LfsButton, LfsModal } from '../../../../shared/ui';
import { CONTENT_COPY } from '../../copy';

interface SharedFeedFollowedModalProps {
  feedName: string;
  ownerName: string;
  onClose: () => void;
  onViewSharedFeeds: () => void;
}

export function SharedFeedFollowedModal({ feedName, ownerName, onClose, onViewSharedFeeds }: SharedFeedFollowedModalProps) {
  return (
    <LfsModal
      title=""
      centeredTitle
      onClose={onClose}
      footer={<LfsButton label={CONTENT_COPY.common.viewSharedFeeds} onClick={onViewSharedFeeds} />}
    >
      <div className="lfa-followed-modal">
        <div className="lfa-followed-modal-check">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="lfa-followed-modal-title">{CONTENT_COPY.feedModals.followedTitle}</div>
        <div className="lfa-followed-modal-card">
          <div className="lfa-followed-modal-feed-name">{feedName}</div>
          <div className="lfa-followed-modal-owner">
            <span>Created by:</span>
            <strong>{ownerName}</strong>
          </div>
        </div>
        <div className="lfa-followed-modal-text">
          {CONTENT_COPY.feedModals.followedHint}
        </div>
      </div>
    </LfsModal>
  );
}
