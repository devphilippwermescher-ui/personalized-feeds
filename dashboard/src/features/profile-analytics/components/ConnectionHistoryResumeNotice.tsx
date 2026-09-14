import { useState } from 'react';
import { HiOutlineArrowPath } from 'react-icons/hi2';
import { sendMessageToExtension } from '../../../services/extension-messaging';

type ResumeState = 'idle' | 'resuming' | 'started' | 'failed';

interface ResumeResponse {
  success?: boolean;
  error?: string;
}

export function ConnectionHistoryResumeNotice() {
  const [state, setState] = useState<ResumeState>('idle');
  const [error, setError] = useState('');

  const resumeHistory = async () => {
    setState('resuming');
    setError('');
    const response = await sendMessageToExtension<ResumeResponse>(
      { type: 'DASHBOARD_RESUME_PROFILE_ANALYTICS_HISTORY' },
      { timeoutMs: 90_000 }
    );
    if (!response?.success) {
      setState('failed');
      setError(response?.error || 'Connections history could not be resumed.');
      return;
    }
    setState('started');
  };

  return (
    <div
      className="profile-analytics-sync-notice profile-analytics-sync-notice--warning profile-analytics-history-resume-notice"
      role="status"
    >
      <div>
        <strong>Connections history needs attention</strong>
        <small>
          Your current total is available. Resume the saved import to finish date ranges without deleting existing
          progress.
        </small>
        {state === 'started' ? <small>Resume started. Saved history progress is being reused.</small> : null}
        {state === 'failed' ? <small className="profile-analytics-history-resume-error">{error}</small> : null}
      </div>
      <button
        className="profile-analytics-history-resume-button"
        type="button"
        disabled={state === 'resuming' || state === 'started'}
        onClick={() => void resumeHistory()}
      >
        <HiOutlineArrowPath aria-hidden="true" />
        {state === 'resuming' ? 'Resuming…' : state === 'started' ? 'Resume started' : 'Resume history'}
      </button>
    </div>
  );
}
