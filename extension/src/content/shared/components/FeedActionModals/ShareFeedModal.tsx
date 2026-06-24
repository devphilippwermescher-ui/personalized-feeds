import { useEffect, useRef, useState } from 'react';
import { LfsButton, LfsDropdown, LfsModal } from '../../../../shared/ui';
import { getMemberInitials } from '../../../feeds-sidebar/utils';
import { CONTENT_COPY } from '../../copy';
import type { FeedShareRecipient } from './types';

interface ShareFeedModalProps {
  onClose: () => void;
  onLoadShares: () => Promise<FeedShareRecipient[]>;
  onShareByEmail: (email: string, role: 'reader' | 'editor') => Promise<{ success: boolean; error?: string }>;
  onUpdateShareRole: (targetUid: string, role: 'reader' | 'editor') => Promise<{ success: boolean; error?: string }>;
  onRemoveShare: (targetUid: string) => Promise<{ success: boolean; error?: string }>;
  onGetLink: () => Promise<{ success: boolean; url?: string; error?: string }>;
}

type ShareTab = 'email' | 'link';
type ShareListState = 'loading' | 'ready' | 'error';

export function ShareFeedModal({
  onClose,
  onLoadShares,
  onShareByEmail,
  onUpdateShareRole,
  onRemoveShare,
  onGetLink,
}: ShareFeedModalProps) {
  const [activeTab, setActiveTab] = useState<ShareTab>('email');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'reader' | 'editor'>('reader');
  const [submitting, setSubmitting] = useState(false);
  const [shares, setShares] = useState<FeedShareRecipient[]>([]);
  const [shareLink, setShareLink] = useState('');
  const [sharesState, setSharesState] = useState<ShareListState>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [updatingShareUid, setUpdatingShareUid] = useState('');
  const [removingShareUid, setRemovingShareUid] = useState('');
  const emailRef = useRef<HTMLInputElement | null>(null);

  const loadShares = async (preservePendingRole = false) => {
    setSharesState((current) => (preservePendingRole && shares.length > 0 ? current : 'loading'));

    try {
      const nextShares = await onLoadShares();
      setShares((current) => {
        if (!preservePendingRole || !updatingShareUid) {
          return nextShares;
        }

        return nextShares.map((share) => {
          const pendingShare = current.find((item) => item.targetUid === share.targetUid);
          return pendingShare && share.targetUid === updatingShareUid ? pendingShare : share;
        });
      });
      setSharesState('ready');
    } catch {
      setShares([]);
      setSharesState('error');
    }
  };

  useEffect(() => {
    void loadShares();
  }, [onLoadShares]);

  useEffect(() => {
    if (activeTab === 'email') {
      emailRef.current?.focus();
    }

    if (activeTab === 'link' && !shareLink) {
      setSubmitting(true);
      setError('');
      setMessage('');
      void onGetLink()
        .then((result) => {
          if (!result.success || !result.url) {
            setError(result.error || 'Failed to generate share link');
            return;
          }

          setShareLink(result.url);
        })
        .finally(() => setSubmitting(false));
    }
  }, [activeTab]);

  const handleShare = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || submitting) {
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    const result = await onShareByEmail(trimmedEmail, role);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Failed to share this feed');
      return;
    }

    setEmail('');
    setMessage('Feed shared successfully');
    await loadShares();
  };

  const handleCopy = async () => {
    if (!shareLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setMessage('Link copied');
      setError('');
    } catch {
      setError('Unable to copy link');
    }
  };

  const handleRoleChange = async (targetUid: string, role: 'reader' | 'editor') => {
    const currentShare = shares.find((share) => share.targetUid === targetUid);
    if (!currentShare || currentShare.role === role || updatingShareUid || removingShareUid) {
      return;
    }

    setUpdatingShareUid(targetUid);
    setError('');
    setMessage('');

    const result = await onUpdateShareRole(targetUid, role);
    setUpdatingShareUid('');

    if (!result.success) {
      setError(result.error || 'Failed to update access role');
      await loadShares();
      return;
    }

    setShares((current) => current.map((share) => (share.targetUid === targetUid ? { ...share, role } : share)));
    setMessage('Access role updated');
  };

  const handleRemoveShare = async (targetUid: string) => {
    const currentShare = shares.find((share) => share.targetUid === targetUid);
    if (!currentShare || updatingShareUid || removingShareUid) {
      return;
    }

    setRemovingShareUid(targetUid);
    setError('');
    setMessage('');

    const result = await onRemoveShare(targetUid);
    setRemovingShareUid('');

    if (!result.success) {
      setError(result.error || 'Failed to remove shared user');
      await loadShares();
      return;
    }

    setShares((current) => current.filter((share) => share.targetUid !== targetUid));
    setMessage(`Access removed for ${currentShare.displayName}`);
  };

  return (
    <LfsModal
      title="Share my feed"
      centeredTitle
      size="lg"
      className="lfa-share-modal-shell"
      bodyClassName="lfa-share-modal-body"
      onClose={onClose}
    >
      <div className="lfa-share-modal">
        <div className="lfa-share-tabs">
          <button
            type="button"
            className={`lfa-share-tab${activeTab === 'email' ? ' lfa-share-tab--active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            By email
          </button>
          <button
            type="button"
            className={`lfa-share-tab${activeTab === 'link' ? ' lfa-share-tab--active lfa-share-tab--link' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            By link
          </button>
        </div>

        {activeTab === 'email' ? (
          <div className="lfa-share-panel">
            <div className="lfa-share-panel-title">
              Enter the email address they used to login to MyFeedIn:
            </div>
            <div className="lfa-share-email-row">
              <input
                ref={emailRef}
                className="lfs-input lfa-share-email-input"
                type="email"
                value={email}
                placeholder="Enter email address"
                onChange={(event) => setEmail(event.target.value)}
              />
              <LfsDropdown
                value={role}
                options={[
                  { value: 'reader', label: 'Reader' },
                  { value: 'editor', label: 'Editor' },
                ]}
                className="lfa-share-role-dropdown"
                onChange={(nextValue) => setRole(nextValue as 'reader' | 'editor')}
              />
            </div>
            <LfsButton
              label={submitting ? 'Sharing...' : 'Share'}
              className="lfa-share-submit-btn"
              disabled={!email.trim() || submitting}
              onClick={() => void handleShare()}
              leadingIcon={<span style={{ fontSize: 20, lineHeight: 1 }}>+</span>}
            />
          </div>
        ) : (
          <div className="lfa-share-panel lfa-share-panel--link">
            <div className="lfa-share-panel-title">
              Share this link with other MyFeedIn users. They need to have the extension installed for it to work.
            </div>
            <div className="lfa-share-link-box">
              <div className="lfa-share-link-value">{shareLink || 'Generating link...'}</div>
              <LfsButton
                label="Copy"
                variant="secondary"
                disabled={!shareLink || submitting}
                onClick={() => void handleCopy()}
              />
            </div>
          </div>
        )}

        {message ? <div className="lfa-share-feedback lfa-share-feedback--success">{message}</div> : null}
        {error ? <div className="lfa-share-feedback lfa-share-feedback--error">{error}</div> : null}

        <div className="lfa-share-shared-with-title">{CONTENT_COPY.feedModals.sharedWithTitle}</div>
        {sharesState === 'loading' ? (
          <div className="lfa-share-loading">
            <div className="lfa-spinner" />
            <div className="lfa-share-loading-copy">
              <div className="lfa-share-loading-title">{CONTENT_COPY.feedModals.sharedLoadingTitle}</div>
              <div className="lfa-share-loading-text">{CONTENT_COPY.feedModals.sharedLoadingHint}</div>
            </div>
          </div>
        ) : null}

        {sharesState === 'ready' && shares.length === 0 ? (
          <div className="lfa-share-empty">
            <div className="lfa-share-empty-icon">
              <svg viewBox="0 0 48 48" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="15" r="7" />
                <path d="M8 36c0-6.2 4.8-10 10-10s10 3.8 10 10" />
                <circle cx="35" cy="17" r="7" />
                <path d="M35 13.5v7" />
                <path d="M31.5 17h7" />
              </svg>
            </div>
            <div className="lfa-share-empty-title">{CONTENT_COPY.feedModals.sharedEmptyTitle}</div>
            <div className="lfa-share-empty-text">{CONTENT_COPY.feedModals.sharedEmptyHint}</div>
          </div>
        ) : null}

        {sharesState === 'error' ? (
          <div className="lfa-share-empty lfa-share-empty--small">
            <div className="lfa-share-empty-title">Unable to load shared users</div>
            <div className="lfa-share-empty-text">Please try again in a moment.</div>
          </div>
        ) : null}

        {sharesState === 'ready' && shares.length > 0 ? (
          <div className="lfa-share-recipient-list">
            {shares.map((share) => (
              <div className="lfa-share-recipient" key={share.targetUid}>
                <div className="lfa-share-recipient-main">
                  {share.photoURL ? (
                    <img className="lfa-share-recipient-avatar" src={share.photoURL} alt={share.displayName} />
                  ) : (
                    <div className="lfa-share-recipient-avatar lfa-share-recipient-avatar--fallback">
                      {getMemberInitials(share.displayName)}
                    </div>
                  )}
                  <div>
                    <div className="lfa-share-recipient-name">{share.displayName}</div>
                    <div className="lfa-share-recipient-email">{share.targetEmail}</div>
                  </div>
                </div>
                <div className="lfa-share-recipient-role-wrap">
                  <div className="lfa-share-recipient-controls">
                    <LfsDropdown
                      value={share.role}
                      options={[
                        { value: 'reader', label: 'Reader' },
                        { value: 'editor', label: 'Editor' },
                      ]}
                      className="lfa-share-recipient-role-dropdown"
                      onChange={(nextValue) => {
                        if (removingShareUid === share.targetUid) {
                          return;
                        }

                        void handleRoleChange(share.targetUid, nextValue as 'reader' | 'editor');
                      }}
                    />
                    <button
                      type="button"
                      className="lfa-share-recipient-remove-btn"
                      aria-label={`Remove ${share.displayName} from shared access`}
                      title="Remove access"
                      disabled={updatingShareUid === share.targetUid || removingShareUid === share.targetUid}
                      onClick={() => void handleRemoveShare(share.targetUid)}
                    >
                      {removingShareUid === share.targetUid ? (
                        <div className="lfa-spinner lfa-spinner--small" />
                      ) : (
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="lfa-share-recipient-actions">
                    {updatingShareUid === share.targetUid ? <div className="lfa-share-recipient-role-status">Saving...</div> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </LfsModal>
  );
}
