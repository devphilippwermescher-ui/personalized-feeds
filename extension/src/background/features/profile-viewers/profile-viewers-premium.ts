function normalizeLinkedInPayloadText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003D/gi, '=')
    .replace(/\\u002D/gi, '-')
    .replace(/\\"/g, '"');
}

function hasPatternNear(
  value: string,
  signalPattern: RegExp,
  contextPattern: RegExp,
  radius = 900
): boolean {
  const pattern = new RegExp(signalPattern.source, signalPattern.flags.includes('g')
    ? signalPattern.flags
    : `${signalPattern.flags}g`);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    const start = Math.max(0, match.index - radius);
    const end = Math.min(value.length, match.index + radius);
    if (contextPattern.test(value.slice(start, end))) {
      return true;
    }
  }

  return false;
}

export function hasExplicitProfileViewerPremiumSignal(rawValue: string): boolean {
  const value = normalizeLinkedInPayloadText(rawValue);

  if (/"(?:isPremiumSubscriber|premiumSubscriber)"\s*:\s*true/i.test(value)) {
    return true;
  }

  const premiumFeaturesBlocks = value.match(/"premiumFeatures"\s*:\s*(?:\[[\s\S]{0,1000}?\]|\{[\s\S]{0,1000}?\})/gi) || [];
  if (premiumFeaturesBlocks.some((block) => /"(?:hasAccess|hasEnabled|premiumSubscriber)"\s*:\s*true/i.test(block))) {
    return true;
  }

  if (/\b(?:profile enhanced with premium|premium[-_ ]?badge|premium_profile|premium-profile|PREMIUM_PROFILE)\b/i.test(value)) {
    return true;
  }

  if (/"(?:a11yText|aria-label|title|text)"\s*:\s*"LinkedIn Premium"/i.test(value)) {
    return true;
  }

  return hasPatternNear(value, /\blinkedin-bug\b/i, /\b(?:premium|badge)\b/i);
}
