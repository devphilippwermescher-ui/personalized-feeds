import { useEffect, useMemo, useRef, useState } from 'react';
import { LfsButton, LfsModal } from '../../../../shared/ui';
import { getMemberInitials } from '../../../feeds-sidebar/utils';
import { CONTENT_COPY } from '../../copy';
import type { LinkedInTypeaheadPerson } from './types';

interface AddPeopleModalProps {
  feedName: string;
  onClose: () => void;
  onSearch: (query: string) => Promise<LinkedInTypeaheadPerson[]>;
  onAddPeople: (people: LinkedInTypeaheadPerson[]) => Promise<{ success: boolean }>;
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
