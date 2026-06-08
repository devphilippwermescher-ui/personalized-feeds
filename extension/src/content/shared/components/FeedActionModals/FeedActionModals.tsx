import { useEffect, useMemo, useRef, useState } from 'react';
import { LfsButton, LfsDropdown, LfsInputField, LfsModal } from '../../../../shared/ui';
import { getMemberInitials } from '../../../feeds-sidebar/utils';
import { CONTENT_COPY, getDeleteFeedDescription } from '../../copy';

export interface LinkedInTypeaheadPerson {
  id: string;
  displayName: string;
  headline: string;
  connectionDegree: string;
  linkedinUrl: string;
  linkedinUsername: string;
  profileUrn?: string;
  memberNumericId?: string;
  profileImageUrl?: string;
}

export interface FeedShareRecipient {
  targetUid: string;
  targetEmail: string;
  displayName: string;
  photoURL?: string;
  role: 'reader' | 'editor';
}

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

interface AddPeopleModalProps {
  feedName: string;
  onClose: () => void;
  onSearch: (query: string) => Promise<LinkedInTypeaheadPerson[]>;
  onAddPeople: (people: LinkedInTypeaheadPerson[]) => Promise<{ success: boolean }>;
}

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

type SearchState = 'idle' | 'loading' | 'success' | 'error';

export function AddPeopleModal({ feedName, onClose, onSearch, onAddPeople }: AddPeopleModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkedInTypeaheadPerson[]>([]);
  const [selectedPeopleById, setSelectedPeopleById] = useState<Record<string, LinkedInTypeaheadPerson>>({});
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTokenRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setSearchState('idle');
      setErrorMessage('');
      return;
    }

    const token = ++searchTokenRef.current;
    const timeoutId = window.setTimeout(() => {
      setSearchState('loading');
      setErrorMessage('');

      void onSearch(trimmed)
        .then((people) => {
          if (token !== searchTokenRef.current) {
            return;
          }

          setResults(people);
          setSearchState('success');
        })
        .catch((error) => {
          if (token !== searchTokenRef.current) {
            return;
          }

          setResults([]);
          setSearchState('error');
          setErrorMessage(error instanceof Error ? error.message : 'Unable to search LinkedIn');
        });
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [onSearch, query]);

  const selectedPeople = useMemo(() => Object.values(selectedPeopleById), [selectedPeopleById]);

  const toggleSelected = (person: LinkedInTypeaheadPerson) => {
    setSelectedPeopleById((current) => {
      if (current[person.id]) {
        const next = { ...current };
        delete next[person.id];
        return next;
      }

      return { ...current, [person.id]: person };
    });
  };

  const handleAdd = async () => {
    if (selectedPeople.length === 0 || adding) {
      return;
    }

    setAdding(true);
    const result = await onAddPeople(selectedPeople);
    setAdding(false);

    if (result.success) {
      onClose();
    }
  };

  const selectedCount = selectedPeople.length;

  return (
    <LfsModal
      title={CONTENT_COPY.feedModals.addPeopleTitle(feedName)}
      centeredTitle
      size="lg"
      onClose={onClose}
      footer={
        <div className="lfa-feed-people-footer">
          <div className="lfa-feed-people-count">{CONTENT_COPY.feedModals.addPeopleSelectedCount(selectedCount)}</div>
          <LfsButton
            label={adding ? CONTENT_COPY.common.adding : CONTENT_COPY.feedModals.addPeopleAction(selectedCount)}
            disabled={selectedCount === 0 || adding}
            className="lfa-feed-people-add-btn"
            onClick={() => void handleAdd()}
            leadingIcon={
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6" />
                <path d="M16 11h6" />
              </svg>
            }
          />
        </div>
      }
    >
      <div className="lfa-feed-modal-body--search">
        <div className="lfa-feed-search-input-wrap">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            className="lfs-input lfa-feed-modal-input--search"
            type="text"
            value={query}
            placeholder={CONTENT_COPY.feedModals.addPeopleSearchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="lfa-feed-people-results">
          {searchState === 'idle' ? (
            <div className="lfa-feed-people-empty">
              <div className="lfa-feed-people-empty-icon">
                <svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="lfaPeopleEmptyIconGradient" x1="14" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#cfd8ea" />
                      <stop offset="1" stopColor="#aebcd6" />
                    </linearGradient>
                  </defs>
                  <circle cx="31" cy="30" r="19" fill="url(#lfaPeopleEmptyIconGradient)" fillOpacity="0.14" />
                  <circle cx="28" cy="26" r="7" stroke="url(#lfaPeopleEmptyIconGradient)" strokeWidth="3" />
                  <path
                    d="M16 44c1.8-6.4 6.9-10 12-10s10.2 3.6 12 10"
                    stroke="url(#lfaPeopleEmptyIconGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle cx="41.5" cy="41.5" r="9.5" fill="#fff" stroke="url(#lfaPeopleEmptyIconGradient)" strokeWidth="3" />
                  <path
                    d="m48 48 5 5"
                    stroke="url(#lfaPeopleEmptyIconGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="lfa-feed-people-empty-title">{CONTENT_COPY.feedModals.addPeopleIdleTitle}</div>
              <div className="lfa-feed-people-empty-text">
                {query.trim().length > 0 && query.trim().length < 2
                  ? CONTENT_COPY.feedModals.addPeopleMinCharsHint
                  : CONTENT_COPY.feedModals.addPeopleIdleHint}
              </div>
            </div>
          ) : null}

          {searchState === 'loading' ? (
            <div className="lfa-feed-people-loading">
              <div className="lfa-spinner" />
              <span>{CONTENT_COPY.feedModals.addPeopleSearching}</span>
            </div>
          ) : null}

          {searchState === 'error' ? (
            <div className="lfa-feed-people-empty lfa-feed-people-empty--small">
              <div className="lfa-feed-people-empty-title">{CONTENT_COPY.feedModals.addPeopleUnavailableTitle}</div>
              <div className="lfa-feed-people-empty-text">{errorMessage}</div>
            </div>
          ) : null}

          {searchState === 'success' && results.length === 0 ? (
            <div className="lfa-feed-people-empty lfa-feed-people-empty--small">
              <div className="lfa-feed-people-empty-title">{CONTENT_COPY.feedModals.addPeopleNoResultsTitle}</div>
              <div className="lfa-feed-people-empty-text">{CONTENT_COPY.feedModals.addPeopleNoResultsHint}</div>
            </div>
          ) : null}

          {searchState === 'success' && results.length > 0
            ? results.map((person) => {
                const selected = Boolean(selectedPeopleById[person.id]);
                return (
                  <button
                    key={person.id}
                    className={`lfa-feed-person-row${selected ? ' lfa-feed-person-row--selected' : ''}`}
                    type="button"
                    onClick={() => toggleSelected(person)}
                  >
                    <div className="lfa-feed-person-left">
                      {person.profileImageUrl ? (
                        <img className="lfa-feed-person-avatar" src={person.profileImageUrl} alt={person.displayName} />
                      ) : (
                        <div className="lfa-feed-person-avatar lfa-feed-person-avatar--fallback">
                          {getMemberInitials(person.displayName)}
                        </div>
                      )}
                      <div className="lfa-feed-person-text">
                        <div className="lfa-feed-person-name">
                          {person.displayName}
                          {person.connectionDegree ? (
                            <span className="lfa-feed-person-degree">{person.connectionDegree}</span>
                          ) : null}
                        </div>
                        <div className="lfa-feed-person-headline">{person.headline || 'LinkedIn member'}</div>
                      </div>
                    </div>
                    <div className="lfa-feed-person-toggle">{selected ? '✓' : '+'}</div>
                  </button>
                );
              })
            : null}
        </div>
      </div>
    </LfsModal>
  );
}

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
