import { useState, type ReactNode } from 'react';
import { LfsButton, LfsModal } from '../../../../shared/ui';
import { CONTENT_COPY, getDeleteFeedDescription } from '../../copy';

interface DeleteFeedModalProps {
  feedName: string;
  memberCount: number;
  title?: string;
  descriptionTitle?: string;
  description?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  submittingLabel?: string;
  confirmVariant?: 'primary' | 'secondary' | 'danger';
  confirmLeadingIcon?: ReactNode;
  onClose: () => void;
  onDelete: () => Promise<{ success: boolean; error?: string }>;
}

export function DeleteFeedModal({
  feedName,
  memberCount,
  title = CONTENT_COPY.feedModals.deleteFeedTitle,
  descriptionTitle,
  description,
  cancelLabel = CONTENT_COPY.common.cancel,
  confirmLabel = CONTENT_COPY.feedModals.deleteFeedAction,
  submittingLabel = CONTENT_COPY.feedModals.deletingFeedAction,
  confirmVariant = 'danger',
  confirmLeadingIcon,
  onClose,
  onDelete,
}: DeleteFeedModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const deleteDescription = getDeleteFeedDescription(feedName, memberCount);
  const leadingIcon =
    confirmLeadingIcon === undefined ? (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4h6v2" />
      </svg>
    ) : (
      confirmLeadingIcon
    );

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
      title={title}
      variant="confirm"
      tone={confirmVariant === 'danger' ? 'danger' : 'neutral'}
      onClose={onClose}
      footer={
        <div className="lfa-feed-confirm-footer">
          <LfsButton
            label={cancelLabel}
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            className="lfa-feed-confirm-cancel-btn"
          />
          <LfsButton
            label={submitting ? submittingLabel : confirmLabel}
            variant={confirmVariant}
            onClick={() => void handleDelete()}
            disabled={submitting}
            className="lfa-feed-delete-confirm-btn"
            leadingIcon={leadingIcon}
          />
        </div>
      }
    >
      <div className="lfa-feed-confirm-content">
        <p className="lfa-feed-confirm-text">{descriptionTitle || deleteDescription.title}</p>
        <p className="lfa-feed-confirm-subtext">{description || deleteDescription.description}</p>
      </div>
    </LfsModal>
  );
}
