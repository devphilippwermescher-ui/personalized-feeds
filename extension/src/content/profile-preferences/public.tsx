import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { UserProfilePreferences } from 'shared/types';
import { injectSharedStyles } from '../../shared/ui';
import type { UserInfo } from '../feeds-sidebar/types';
import { ProfilePreferencesModal } from './components/ProfilePreferencesModal';
import { loadProfilePreferences } from './services/profile-preferences-service';
import { PROFILE_PREFERENCES_CSS } from './styles';

const HOST_ID = 'mfp-profile-preferences-root';
const STYLE_ID = 'mfp-profile-preferences-styles';
export const PROFILE_PREFERENCES_UPDATED_EVENT = 'mfp:profile-preferences-updated';

let root: Root | null = null;
let host: HTMLElement | null = null;

function injectStyles(): void {
  injectSharedStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PROFILE_PREFERENCES_CSS;
  document.head.appendChild(style);
}

export function closeProfilePreferencesModal(): void {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
  document.getElementById(HOST_ID)?.remove();
}

export async function openProfilePreferencesModal(): Promise<void> {
  const { preferences, user } = await loadProfilePreferences();
  injectStyles();
  closeProfilePreferencesModal();

  host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(
    createElement(ProfilePreferencesModal, {
      initialPreferences: preferences,
      user,
      onClose: closeProfilePreferencesModal,
      onSaved: (updatedUser: UserInfo, updatedPreferences: UserProfilePreferences) => {
        document.dispatchEvent(
          new CustomEvent(PROFILE_PREFERENCES_UPDATED_EVENT, {
            detail: { user: updatedUser, preferences: updatedPreferences },
          })
        );
      },
    })
  );
}
