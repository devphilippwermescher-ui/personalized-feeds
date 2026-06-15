import { useState } from 'react';
import { LfsButton, LfsModal } from '../../../../shared/ui';
import { CONTENT_COPY } from '../../copy';

interface ConfirmDuplicateModalProps {
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDuplicateModal({ onClose, onConfirm }: ConfirmDuplicateModalProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  };

  return (
    <LfsModal title={CONTENT_COPY.feedModals.duplicateTitle} centeredTitle onClose={onClose}>
      <div className="lfa-duplicate-modal">
        <div className="lfa-duplicate-icon">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
        </div>
        <div className="lfa-duplicate-text">
          Duplicating this shared feed will create a custom feed with the same information.
        </div>
        <div className="lfa-duplicate-actions">
          <LfsButton label={CONTENT_COPY.common.cancel} variant="secondary" onClick={onClose} />
          <LfsButton label={submitting ? 'Duplicating...' : 'Yes'} onClick={() => void handleConfirm()} />
        </div>
      </div>
    </LfsModal>
  );
}
