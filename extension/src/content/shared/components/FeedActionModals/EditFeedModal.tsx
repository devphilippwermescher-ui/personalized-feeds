import { useEffect, useMemo, useRef, useState } from 'react';
import { LfsButton, LfsInputField, LfsModal } from '../../../../shared/ui';
import { CONTENT_COPY } from '../../copy';

interface EditFeedModalProps {
  feedName: string;
  existingFeedNames: string[];
  onClose: () => void;
  onSave: (nextName: string) => Promise<{ success: boolean; error?: string }>;
}

export function EditFeedModal({ feedName, existingFeedNames, onClose, onSave }: EditFeedModalProps) {
  const [value, setValue] = useState(feedName);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const duplicateExists = useMemo(() => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === feedName.trim().toLowerCase()) {
      return false;
    }

    return existingFeedNames.some((name) => name.trim().toLowerCase() === normalized);
  }, [existingFeedNames, feedName, value]);

  const handleSave = async () => {
    const nextName = value.trim();
    if (!nextName || duplicateExists || submitting) {
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    const result = await onSave(nextName);
    setSubmitting(false);

    if (!result.success) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <LfsModal
      title={CONTENT_COPY.feedModals.editFeedTitle}
      footer={
        <LfsButton
          label={CONTENT_COPY.feedModals.saveChangesAction}
          disabled={!value.trim() || duplicateExists || submitting}
          onClick={() => void handleSave()}
          leadingIcon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
        />
      }
      onClose={onClose}
    >
      <div className="lfa-feed-modal-form">
        <LfsInputField
          id="lfa-feed-edit-name"
          label={CONTENT_COPY.feedModals.feedNameLabel}
          value={value}
          placeholder={CONTENT_COPY.feedModals.feedNamePlaceholder}
          inputRef={inputRef}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </LfsModal>
  );
}
