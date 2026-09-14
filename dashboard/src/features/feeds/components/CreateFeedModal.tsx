import { useState } from 'react';
import { Modal } from 'shared/ui/modal';

const COLORS = ['#615DEC', '#2563EB', '#059669', '#DC2626', '#D97706', '#7C3AED', '#0891B2', '#BE185D'];

interface CreateFeedModalProps {
  onClose: () => void;
  onCreate: (name: string, description?: string, color?: string) => Promise<void>;
  initialValues?: { name: string; description: string; color: string };
  title?: string;
  submitLabel?: string;
}

export default function CreateFeedModal({
  onClose,
  onCreate,
  initialValues,
  title = 'Create New Feed',
  submitLabel = 'Create Feed',
}: CreateFeedModalProps) {
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [color, setColor] = useState(initialValues?.color || '#615DEC');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreate(name.trim(), description.trim() || undefined, color);
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={title}
      variant="form"
      size="md"
      closeOnEscape={false}
      titleId="dashboard-feed-modal-title"
      onClose={onClose}
      classNames={{
        overlay: 'modal-overlay',
        dialog: 'modal',
        body: 'modal-body',
        footer: 'modal-footer',
      }}
      header={
        <div className="modal-header">
          <h2 id="dashboard-feed-modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
      }
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting ? 'Saving...' : submitLabel}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label>Feed Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Prospects, Industry Leaders..."
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this feed for?"
        />
      </div>
      <div className="form-group">
        <label>Color</label>
        <div className="color-picker">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-option ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
