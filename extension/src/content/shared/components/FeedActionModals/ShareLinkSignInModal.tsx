import { LfsButton, LfsModal } from '../../../../shared/ui';

interface ShareLinkSignInModalProps {
  onClose: () => void;
}

export function ShareLinkSignInModal({ onClose }: ShareLinkSignInModalProps) {
  return (
    <LfsModal
      title="Sign in to view this shared feed"
      centeredTitle
      onClose={onClose}
      footer={<LfsButton label="Close" variant="secondary" onClick={onClose} />}
    >
      <div className="lfa-share-sign-in-modal">
        <div className="lfa-share-sign-in-modal-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
          </svg>
        </div>
        <p>This feed was shared with you. Sign in to myFeedPilot in the sidebar to open it.</p>
        <p className="lfa-share-sign-in-modal-hint">Your shared-feed link will remain available after you sign in.</p>
      </div>
    </LfsModal>
  );
}
