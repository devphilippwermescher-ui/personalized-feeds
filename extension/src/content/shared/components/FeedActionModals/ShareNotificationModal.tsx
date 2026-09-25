import { useState } from 'react';
import type { ShareNotification, SharingLimitDetails } from 'shared/types';
import { LfsButton, LfsModal } from '../../../../shared/ui';

interface ShareNotificationModalProps {
  notification: ShareNotification;
  onClose: () => void;
  onDismiss: () => Promise<void>;
  onAccept: () => Promise<{ success: boolean; error?: string; sharingLimit?: SharingLimitDetails }>;
  onAccepted: () => void;
  onViewSharedFeeds: () => void;
  onSharingLimit: (details: SharingLimitDetails) => void;
  onUpgrade: () => void;
}

export function ShareNotificationModal({
  notification,
  onClose,
  onDismiss,
  onAccept,
  onAccepted,
  onViewSharedFeeds,
  onSharingLimit,
  onUpgrade,
}: ShareNotificationModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isIncomingShare = notification.kind === 'incoming_share_added';
  const isPendingInvitation = notification.kind === 'incoming_share_blocked';
  const currentUserCanUpgrade = isPendingInvitation || notification.kind === 'link_follow_blocked_owner';
  const title = isIncomingShare
    ? 'A feed was shared with you'
    : isPendingInvitation
      ? 'A shared feed is waiting'
      : 'Shared-feed follow attempt';
  const body = isIncomingShare
    ? `${notification.ownerDisplayName} shared “${notification.feedName}” with you as ${notification.role === 'editor' ? 'an Editor' : 'a Reader'}.`
    : isPendingInvitation
      ? `${notification.ownerDisplayName} tried to share “${notification.feedName}” with you, but your Free sharing limit is currently full.`
      : notification.kind === 'link_follow_blocked_owner'
        ? `${notification.recipientDisplayName} tried to follow “${notification.feedName}”, but your current sharing limit prevented it.`
        : `${notification.recipientDisplayName} tried to follow “${notification.feedName}”, but their current incoming sharing limit prevented it.`;

  const dismiss = async (afterDismiss = onClose) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onDismiss();
      afterDismiss();
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : 'Failed to dismiss notification');
      setSubmitting(false);
    }
  };

  const accept = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    let result: Awaited<ReturnType<typeof onAccept>>;
    try {
      result = await onAccept();
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'This feed cannot be accepted yet');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (result.success) {
      onAccepted();
      return;
    }
    if (!result.success && result.sharingLimit) {
      await dismiss(() => onSharingLimit(result.sharingLimit as SharingLimitDetails));
      return;
    }
    setError(result.error || 'This feed cannot be accepted yet');
  };

  return (
    <LfsModal
      title={title}
      tone={isIncomingShare ? undefined : 'warning'}
      centeredTitle
      onClose={() => void dismiss()}
      footer={
        <>
          <LfsButton label="Close" variant="secondary" disabled={submitting} onClick={() => void dismiss()} />
          {isIncomingShare ? (
            <LfsButton
              label="View shared feeds"
              disabled={submitting}
              onClick={() => void dismiss(onViewSharedFeeds)}
            />
          ) : isPendingInvitation ? (
            <>
              <LfsButton
                label="View Pro"
                variant="secondary"
                disabled={submitting}
                onClick={() => void dismiss(onUpgrade)}
              />
              <LfsButton
                label={submitting ? 'Checking…' : 'Try to accept'}
                disabled={submitting}
                onClick={() => void accept()}
              />
            </>
          ) : currentUserCanUpgrade ? (
            <LfsButton label="View Pro" disabled={submitting} onClick={() => void dismiss(onUpgrade)} />
          ) : null}
        </>
      }
    >
      <div className="lfa-share-notification-modal">
        <div className="lfa-share-notification-feed">{notification.feedName}</div>
        <p>{body}</p>
        {isPendingInvitation ? <p>Free supports shared feeds from 1 person and up to 3 shared feeds.</p> : null}
        {error ? <div className="lfa-share-notification-error">{error}</div> : null}
      </div>
    </LfsModal>
  );
}
