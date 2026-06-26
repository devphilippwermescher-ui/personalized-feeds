export interface RelationshipButtonSignal {
  text: string;
  label: string;
}

export function getRelationshipButtonSignal(element: Element): RelationshipButtonSignal {
  return {
    text: element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '',
    label: element.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim().toLowerCase() || '',
  };
}

function hasAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function hasFollowingSignal({ text, label }: RelationshipButtonSignal): boolean {
  return (
    text === 'following' ||
    text === 'unfollow' ||
    label.startsWith('following') ||
    label.includes('unfollow') ||
    hasAny(text, ['відстеж', 'відпис', 'підписані', 'подписаны', 'отпис', 'отслеж']) ||
    hasAny(label, ['відстеж', 'відпис', 'підписані', 'подписаны', 'отпис', 'отслеж'])
  );
}

export function hasFollowSignal(signal: RelationshipButtonSignal): boolean {
  if (hasFollowingSignal(signal)) {
    return false;
  }

  const { text, label } = signal;
  return (
    text === 'follow' ||
    text === '+ follow' ||
    label.startsWith('follow') ||
    hasAny(text, ['стежити', 'підписатися', 'подписаться']) ||
    hasAny(label, ['стежити', 'підписатися', 'подписаться'])
  );
}

export function hasRelationshipSignal({ text, label }: RelationshipButtonSignal): boolean {
  const value = `${text} ${label}`;
  return (
    /connect|invite|pending|withdraw|message|follow|unfollow/i.test(value) ||
    hasAny(value, [
      'встановити',
      'контакт',
      'повідомлення',
      'розгляда',
      'скасувати',
      'стежити',
      'відстеж',
      'підпис',
      'подпис',
      'отслеж',
      'отпис',
    ])
  );
}
