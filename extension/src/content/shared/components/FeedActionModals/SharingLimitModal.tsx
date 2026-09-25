import type { SharingLimitDetails } from 'shared/types';
import { LfsButton, LfsModal } from '../../../../shared/ui';

interface SharingLimitModalProps {
  details: SharingLimitDetails;
  source: 'email' | 'link' | 'notification';
  onClose: () => void;
  onUpgrade: () => void;
}

export function getSharingLimitCopy(details: SharingLimitDetails, source: SharingLimitModalProps['source']) {
  const name = details.counterpartDisplayName || (source === 'email' ? 'This person' : 'The feed owner');

  if (details.blockedParty === 'counterparty') {
    if (details.direction === 'incoming') {
      return details.dimension === 'people'
        ? {
            title: 'This person can’t receive the feed',
            body: `${name} uses the Free plan and can receive shared feeds from only 1 person.${details.notificationCreated ? ` We notified ${name}.` : ''}`,
          }
        : {
            title: 'This person reached their feed limit',
            body: `${name} uses the Free plan and can receive up to 3 shared feeds.${details.notificationCreated ? ` We notified ${name}.` : ''}`,
          };
    }

    return details.dimension === 'people'
      ? {
          title: 'The feed owner reached their Free limit',
          body: `${name} uses the Free plan and can share feeds with only 1 person. They are already using this sharing slot.${details.notificationCreated ? ' The owner was notified.' : ''}`,
        }
      : {
          title: 'The feed owner reached their feed limit',
          body: `${name} uses the Free plan and can share up to 3 feeds.${details.notificationCreated ? ' The owner was notified.' : ''}`,
        };
  }

  if (details.direction === 'outgoing') {
    return details.dimension === 'people'
      ? {
          title: 'Share with more people with Pro',
          body: 'Free lets you share up to 3 feeds with 1 person. You are already using this sharing slot.',
        }
      : {
          title: 'Share more feeds with Pro',
          body: 'Free lets you share up to 3 feeds. Remove access from a shared feed or upgrade to Pro.',
        };
  }

  return details.dimension === 'people'
    ? {
        title: 'Receive feeds from more people with Pro',
        body: `Free lets you receive shared feeds from 1 person. ${name} tried to share another feed with you.`,
      }
    : {
        title: 'You reached your shared-feed limit',
        body: `Free lets you receive up to 3 shared feeds. Unfollow one feed or upgrade to accept a feed from ${name}.`,
      };
}

export function SharingLimitModal({ details, source, onClose, onUpgrade }: SharingLimitModalProps) {
  const copy = getSharingLimitCopy(details, source);
  const canUpgrade = details.blockedParty === 'current_user';

  return (
    <LfsModal
      title={copy.title}
      tone="warning"
      centeredTitle
      onClose={onClose}
      footer={
        <>
          <LfsButton label="Close" variant="secondary" onClick={onClose} />
          {canUpgrade ? <LfsButton label="View Pro" onClick={onUpgrade} /> : null}
        </>
      }
    >
      <div className="lfa-sharing-limit-modal">
        <div className="lfa-sharing-limit-modal-icon" aria-hidden="true">
          !
        </div>
        <p>{copy.body}</p>
      </div>
    </LfsModal>
  );
}
