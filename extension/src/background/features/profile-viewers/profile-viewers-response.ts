export type ProfileViewersResponseValidation =
  | { valid: true }
  | { valid: false; authRequired: boolean; reason: string };

const RESPONSE_MARKERS = ['WvmpEntityList', 'wvmp-entity-list', 'ProfileViewSortType_', 'paginationNeeded'];

export function validateProfileViewersRscPayload(payload: string): ProfileViewersResponseValidation {
  const normalized = payload.trim();
  if (normalized.length < 100) {
    return {
      valid: false,
      authRequired: false,
      reason: 'LinkedIn profile viewers response was empty or unexpectedly short.',
    };
  }

  const looksLikeHtml = /^<!doctype\s+html|^<html|<body[\s>]/i.test(normalized);
  const looksLikeAuthenticationPage =
    looksLikeHtml &&
    (/(?:authwall|checkpoint\/challenge|sign\s+in\s+to\s+linkedin|linkedin\s+login)/i.test(normalized) ||
      /<form[^>]+(?:login|signin)/i.test(normalized));

  if (looksLikeAuthenticationPage) {
    return {
      valid: false,
      authRequired: true,
      reason: 'LinkedIn returned an authentication page instead of profile viewers data.',
    };
  }

  if (RESPONSE_MARKERS.some((marker) => normalized.includes(marker))) {
    return { valid: true };
  }

  return {
    valid: false,
    authRequired: false,
    reason: 'LinkedIn profile viewers response did not contain the expected WVMP structure.',
  };
}
