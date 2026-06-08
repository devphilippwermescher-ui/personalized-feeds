import { createPortal } from 'react-dom';
import { CONTENT_COPY } from '../../../shared/copy';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  );
}

export function AuthPrompt() {
  const modal = (
    <div className="lfs-modal-overlay pf-auth-overlay" id="pf-auth-overlay" style={{ display: 'none' }}>
      <div className="lfs-modal lfs-modal--md pf-auth-modal">
        <div className="lfs-modal__header pf-feed-modal-header">
          <h3 className="lfs-modal__title">{CONTENT_COPY.profile.authTitle}</h3>
          <button className="lfs-modal__close pf-feed-modal-close" id="pf-auth-close" aria-label={CONTENT_COPY.common.close}>
            <CloseIcon />
          </button>
        </div>
        <div className="pf-auth-body">
          <p>{CONTENT_COPY.profile.authDescription}</p>
          <button className="pf-auth-google-btn" id="pf-auth-google-btn">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {CONTENT_COPY.profile.authButton}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
