import { LfsButton, LfsModal } from '../../../../shared/ui';
import { CONTENT_COPY } from '../../copy';

interface SharedFeedFollowedModalProps {
  feedName: string;
  ownerName: string;
  mode?: 'followed' | 'roleChanged';
  role?: 'reader' | 'editor';
  onClose: () => void;
  onViewSharedFeeds: () => void;
}

function formatRole(role?: 'reader' | 'editor'): string {
  return role === 'editor' ? 'Editor' : 'Reader';
}

export function SharedFeedFollowedModal({
  feedName,
  ownerName,
  mode = 'followed',
  role,
  onClose,
  onViewSharedFeeds,
}: SharedFeedFollowedModalProps) {
  const isRoleChanged = mode === 'roleChanged';

  return (
    <LfsModal
      title=""
      variant="success"
      tone="success"
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
        <div className="lfa-followed-modal-title">
          {isRoleChanged ? CONTENT_COPY.feedModals.roleChangedTitle : CONTENT_COPY.feedModals.followedTitle}
        </div>
        <div className="lfa-followed-modal-card">
          <div className="lfa-followed-modal-feed-name">{feedName}</div>
          <div className="lfa-followed-modal-owner">
            <span>{isRoleChanged ? 'New role:' : 'Created by:'}</span>
            <strong>{isRoleChanged ? formatRole(role) : ownerName}</strong>
          </div>
          {isRoleChanged ? (
            <div className="lfa-followed-modal-owner lfa-followed-modal-owner--secondary">
              <span>Created by:</span>
              <strong>{ownerName}</strong>
            </div>
          ) : null}
        </div>
        <div className="lfa-followed-modal-text">
          {isRoleChanged ? CONTENT_COPY.feedModals.roleChangedHint(feedName) : CONTENT_COPY.feedModals.followedHint}
        </div>
      </div>
    </LfsModal>
  );
}
