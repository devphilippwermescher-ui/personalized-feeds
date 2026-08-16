import { useState } from 'react';
import { HiOutlineArrowPath, HiOutlineTrash } from 'react-icons/hi2';
import { sendMessageToExtension } from '../../../utils/extensionMessaging';

type ResetState = 'idle' | 'confirming' | 'resetting' | 'started' | 'failed';

interface ResetResponse {
  success?: boolean;
  collectionQueued?: boolean;
  result?: {
    deletedDocuments?: number;
  };
  error?: string;
}

export function ProfileAnalyticsDevTools() {
  const [state, setState] = useState<ResetState>('idle');
  const [message, setMessage] = useState('');

  const resetAnalytics = async () => {
    if (state !== 'confirming') {
      setState('confirming');
      setMessage('Click again to confirm deletion for the current test user.');
      return;
    }

    setState('resetting');
    setMessage('Deleting analytics test data…');
    const response = await sendMessageToExtension<ResetResponse>(
      { type: 'DASHBOARD_DEV_RESET_ANALYTICS' },
      { timeoutMs: 120_000 }
    );
    if (!response.success) {
      setState('failed');
      setMessage(response.error || 'Analytics test data could not be reset.');
      return;
    }

    setState('started');
    setMessage(`${response.result?.deletedDocuments || 0} analytics documents deleted. First-run collection started.`);
  };

  return (
    <aside className="profile-analytics-dev-tools" aria-label="Profile Analytics development tools">
      <div>
        <strong>Development tools</strong>
        <small>
          Reset Profile Analytics for this test user and replay its first-time LinkedIn collection. Auth, feeds,
          settings and Profile Viewers are preserved.
        </small>
        {message ? (
          <small className={state === 'failed' ? 'profile-analytics-dev-tools-error' : ''}>{message}</small>
        ) : null}
      </div>
      <button
        type="button"
        className={
          state === 'confirming'
            ? 'profile-analytics-dev-reset-button is-confirming'
            : 'profile-analytics-dev-reset-button'
        }
        disabled={state === 'resetting' || state === 'started'}
        onClick={() => void resetAnalytics()}
      >
        {state === 'resetting' || state === 'started' ? (
          <HiOutlineArrowPath aria-hidden="true" />
        ) : (
          <HiOutlineTrash aria-hidden="true" />
        )}
        {state === 'resetting'
          ? 'Resetting…'
          : state === 'started'
            ? 'Collection started'
            : state === 'confirming'
              ? 'Confirm reset'
              : 'Reset analytics'}
      </button>
    </aside>
  );
}
