import { useMemo, useRef, useState } from 'react';
import type { BillingCurrency, UserProfilePreferences } from 'shared/types';
import { LfsButton, LfsInputField, LfsModal } from '../../../shared/ui';
import type { UserInfo } from '../../feeds-sidebar/types';
import { createAvatarDataUrl } from '../logic/avatar-image';
import { saveProfilePreferences } from '../services/profile-preferences-service';

interface ProfilePreferencesModalProps {
  initialPreferences: UserProfilePreferences;
  user: UserInfo;
  onClose: () => void;
  onSaved: (user: UserInfo, preferences: UserProfilePreferences) => void;
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  return initials || 'U';
}

export function ProfilePreferencesModal({ initialPreferences, user, onClose, onSaved }: ProfilePreferencesModalProps) {
  const authDisplayName = user.authDisplayName || user.displayName || 'User';
  const authPhotoURL = user.authPhotoURL || '';
  const [displayName, setDisplayName] = useState(initialPreferences.displayName || authDisplayName);
  const [avatarDataUrl, setAvatarDataUrl] = useState(initialPreferences.avatarDataUrl);
  const [billingCurrency, setBillingCurrency] = useState<BillingCurrency>(initialPreferences.billingCurrency);
  const [avatarError, setAvatarError] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarUrl = avatarDataUrl || authPhotoURL;
  const effectiveName = displayName.trim() || authDisplayName;
  const initials = useMemo(() => getInitials(effectiveName), [effectiveName]);

  const chooseAvatar = async (file?: File): Promise<void> => {
    if (!file) return;
    setError('');
    try {
      setAvatarDataUrl(await createAvatarDataUrl(file));
      setAvatarError(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Avatar could not be processed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async (): Promise<void> => {
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setError('Enter a display name.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await saveProfilePreferences({
        displayName: normalizedName === authDisplayName ? '' : normalizedName,
        avatarDataUrl,
        billingCurrency,
      });
      onSaved(result.user, result.preferences);
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LfsModal
      title="Profile & billing"
      size="md"
      centeredTitle
      className="mfp-profile-preferences-modal"
      bodyClassName="mfp-profile-preferences-body"
      onClose={onClose}
      footer={
        <div className="mfp-profile-preferences-footer">
          <button
            className="mfp-profile-preferences-reset"
            type="button"
            onClick={() => {
              setDisplayName(authDisplayName);
              setAvatarDataUrl('');
              setAvatarError(false);
              setError('');
            }}
          >
            Reset to Google profile
          </button>
          <div className="mfp-profile-preferences-footer-actions">
            <LfsButton label="Cancel" variant="secondary" onClick={onClose} />
            <LfsButton label={saving ? 'Saving…' : 'Save changes'} disabled={saving} onClick={() => void save()} />
          </div>
        </div>
      }
    >
      <div className="mfp-profile-preferences-avatar-row">
        {avatarUrl && !avatarError ? (
          <img className="mfp-profile-preferences-avatar" src={avatarUrl} alt="" onError={() => setAvatarError(true)} />
        ) : (
          <div className="mfp-profile-preferences-avatar-fallback" aria-hidden="true">
            {initials}
          </div>
        )}
        <div className="mfp-profile-preferences-avatar-copy">
          <p className="mfp-profile-preferences-avatar-title">Profile photo</p>
          <div className="mfp-profile-preferences-avatar-actions">
            <button
              className="mfp-profile-preferences-small-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload photo
            </button>
            {avatarDataUrl ? (
              <button
                className="mfp-profile-preferences-small-button"
                type="button"
                onClick={() => {
                  setAvatarDataUrl('');
                  setAvatarError(false);
                }}
              >
                Use Google photo
              </button>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => void chooseAvatar(event.target.files?.[0])}
          />
        </div>
      </div>

      <LfsInputField
        label="Display name"
        value={displayName}
        maxLength={60}
        helper="This name is shown inside myFeedPilot."
        onChange={(event) => setDisplayName(event.target.value)}
      />

      <div className="mfp-profile-preferences-section">
        <p className="mfp-profile-preferences-label">Signed-in email</p>
        <div className="mfp-profile-preferences-email">{user.email}</div>
      </div>

      <div className="mfp-profile-preferences-section">
        <p className="mfp-profile-preferences-label">Billing currency</p>
        <div className="mfp-profile-preferences-currency" role="group" aria-label="Billing currency">
          {(['EUR', 'USD'] as const).map((currency) => {
            const selected = currency === billingCurrency;
            return (
              <button
                key={currency}
                type="button"
                className={`mfp-profile-preferences-currency-option${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => setBillingCurrency(currency)}
              >
                <strong>{currency === 'EUR' ? '€ Euro' : '$ US Dollar'}</strong>
                <span>{currency}</span>
              </button>
            );
          })}
        </div>
        <p className="mfp-profile-preferences-hint">Pro prices are shown in your selected currency.</p>
      </div>

      {error ? (
        <p className="mfp-profile-preferences-error" role="alert">
          {error}
        </p>
      ) : null}
    </LfsModal>
  );
}
