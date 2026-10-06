import { useState } from 'react';
import type { ShareNotification } from 'shared/types';
import { LfsButton, LfsModal } from '../../../../shared/ui';

interface ShareNotificationModalProps {
  notification: ShareNotification;
  onClose: () => void;
  onDismiss: () => Promise<void>;
  onViewSharedFeeds: () => void;
  onUpgrade: () => void;
}

export function ShareNotificationModal({
  notification,
  onClose,
  onDismiss,
  onViewSharedFeeds,
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
            <LfsButton label="Get Pro" disabled={submitting} onClick={() => void dismiss(onUpgrade)} />
          ) : currentUserCanUpgrade ? (
            <LfsButton label="Get Pro" disabled={submitting} onClick={() => void dismiss(onUpgrade)} />
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
