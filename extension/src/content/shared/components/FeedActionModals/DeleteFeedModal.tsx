import { useState } from 'react';
import { LfsButton, LfsModal } from '../../../../shared/ui';
import { CONTENT_COPY, getDeleteFeedDescription } from '../../copy';

interface DeleteFeedModalProps {
  feedName: string;
  memberCount: number;
  onClose: () => void;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

export function DeleteFeedModal({ feedName, memberCount, onClose, onDelete }: DeleteFeedModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    const result = await onDelete();
    setSubmitting(false);

    if (result.success) {
      onClose();
    }
  };

  return (
    <LfsModal
      title={CONTENT_COPY.feedModals.deleteFeedTitle}
      onClose={onClose}
      footer={
        <div className="lfa-feed-confirm-footer">
          <LfsButton label={CONTENT_COPY.common.cancel} variant="secondary" onClick={onClose} disabled={submitting} className="lfa-feed-confirm-cancel-btn" />
          <LfsButton
            label={submitting ? CONTENT_COPY.feedModals.deletingFeedAction : CONTENT_COPY.feedModals.deleteFeedAction}
            variant="danger"
            onClick={() => void handleDelete()}
            disabled={submitting}
            className="lfa-feed-delete-confirm-btn"
            leadingIcon={
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            }
          />
        </div>
      }
    >
      <div className="lfa-feed-confirm-content">
        <p className="lfa-feed-confirm-text">
          {getDeleteFeedDescription(feedName, memberCount).title}
        </p>
        <p className="lfa-feed-confirm-subtext">
          {getDeleteFeedDescription(feedName, memberCount).description}
        </p>
      </div>
    </LfsModal>
  );
}
