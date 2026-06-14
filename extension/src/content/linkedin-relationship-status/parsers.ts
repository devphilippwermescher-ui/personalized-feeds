import { asArray, asRecord, asString, decodeHtmlEntities, getComposeOptionType, isFollowingStateActive, normalizeRelationshipResolution, pickProfileUrn, trimLinkedInValue } from './utils';
import type { RelationshipResolution, RelationshipStatus } from './types';

// ── Rehydration (window.__como_rehydration__) parser ──────────────────────

function extractBestVectorImageUrl(vectorImage: unknown): string {
  const image = asRecord(vectorImage);
  if (!image) {
    return '';
  }

  const rootUrl = asString(image.rootUrl);
  const artifacts = asArray(image.artifacts)
    .map(asRecord)
    .filter((artifact): artifact is Record<string, unknown> => Boolean(artifact))
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  const path = asString(artifacts[0]?.fileIdentifyingUrlPathSegment);

  return rootUrl && path ? `${rootUrl}${path}` : '';
}

function normalizeMediaUrl(url: string): string {
  return decodeHtmlEntities(url).replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
}

function extractBestSrcSetUrl(srcSet: string): string {
  const candidates = normalizeMediaUrl(srcSet)
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim();
      const match = trimmed.match(/^(https:\/\/media\.licdn\.com\/\S+profile-(?:displayphoto|framedphoto)\S+)\s+(\d+)w$/i);
      return match ? { url: match[1], width: Number(match[2]) || 0 } : null;
    })
    .filter((candidate): candidate is { url: string; width: number } => Boolean(candidate))
    .sort((a, b) => b.width - a.width);

  return candidates[0]?.url || '';
}

function extractRenderedTopCardImageUrl(doc: Document): string {
  const preloadLinks = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]'));
  for (const link of preloadLinks) {
    const srcSet = link.getAttribute('imagesrcset') || link.getAttribute('imageSrcSet') || '';
    if (!srcSet.includes('profile-displayphoto') && !srcSet.includes('profile-framedphoto')) {
      continue;
    }

    const imageUrl = extractBestSrcSetUrl(srcSet);
    if (imageUrl) {
      return imageUrl;
    }
  }

  const topCardImages = Array.from(doc.querySelectorAll<HTMLImageElement>('[componentkey="topcard-logo-image-referencekey"] img[srcset], [componentkey="topcard-logo-image-referencekey"] img[srcSet]'));
  for (const img of topCardImages) {
    const srcSet = img.getAttribute('srcset') || img.getAttribute('srcSet') || '';
    const imageUrl = extractBestSrcSetUrl(srcSet);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return '';
}

function extractBestSuffixUrlImage(value: unknown): string {
  const record = asRecord(value);
  if (!record) {
    return '';
  }

  const initialSrc = asString(record.initialSrc) || '';
  const artifacts = asArray(record.artifacts)
    .map(asRecord)
    .filter((artifact): artifact is Record<string, unknown> => Boolean(artifact))
    .sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
  const suffixUrl = asString(artifacts[0]?.suffixUrl);
  const assetUrn = asString(record.assetUrn) || '';
  const assetId = assetUrn.match(/urn:li:digitalmediaAsset:([^)"'\\\s]+)/)?.[1] || '';
  const baseMatch = initialSrc.match(/^(https:\/\/media\.licdn\.com\/dms\/image\/v2\/[^/]+\/profile-(?:displayphoto|framedphoto)[^/]*_)/i);

  if (assetId && suffixUrl) {
    const imageKind = suffixUrl.includes('profile-framedphoto') ? 'profile-framedphoto-shrink_' : 'profile-displayphoto-shrink_';
    return normalizeMediaUrl(`https://media.licdn.com/dms/image/v2/${assetId}/${imageKind}${suffixUrl}`);
  }

  if (baseMatch?.[1] && suffixUrl) {
    return normalizeMediaUrl(`${baseMatch[1]}${suffixUrl}`);
  }

  return initialSrc.includes('profile-displayphoto') || initialSrc.includes('profile-framedphoto')
    ? normalizeMediaUrl(initialSrc)
    : '';
}

function extractProfileImageUrl(profileEntry: unknown): string {
  const profile = asRecord(profileEntry);
  const picture = asRecord(profile?.profilePicture);
  const directResolution = asRecord(picture?.displayImageReferenceResolutionResult);
  const framedResolution = asRecord(picture?.displayImageWithFrameReference);

  return (
    extractBestVectorImageUrl(directResolution?.vectorImage) ||
    asString(directResolution?.url) ||
    extractBestVectorImageUrl(framedResolution?.vectorImage) ||
    asString(framedResolution?.url) ||
    ''
  );
}

function findProfileImageUrl(value: unknown, targetProfileUrn?: string): string {
  const record = asRecord(value);
  if (!record) {
    return '';
  }

  const ownProfileUrn = pickProfileUrn(record.entityUrn);
  if (targetProfileUrn && ownProfileUrn && ownProfileUrn !== targetProfileUrn) {
    return '';
  }

  const suffixUrlImage = extractBestSuffixUrlImage(record);
  if (suffixUrlImage) {
    return suffixUrlImage;
  }

  if (!targetProfileUrn || ownProfileUrn === targetProfileUrn) {
    const ownImageUrl = extractProfileImageUrl(record);
    if (ownImageUrl) {
      return ownImageUrl;
    }
  }

  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const imageUrl = findProfileImageUrl(item, targetProfileUrn);
        if (imageUrl) {
          return imageUrl;
        }
      }
      continue;
    }

    if (nested && typeof nested === 'object') {
      const imageUrl = findProfileImageUrl(nested, targetProfileUrn);
      if (imageUrl) {
        return imageUrl;
      }
    }
  }

  return '';
}

function tryParseJsonFromIndex(content: string, startIdx: number): Record<string, unknown> | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < content.length; i++) {
    const ch = content[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(content.slice(startIdx, i + 1)) as Record<string, unknown>; }
        catch { return null; }
      }
    }
  }
  return null;
}

function extractRehydrationStateFromHtml(html: string): Record<string, unknown> | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script:not([src])'));

  for (const script of scripts) {
    const content = script.textContent || '';
    if (!content.includes('__como_rehydration__')) continue;

    const assignIdx = content.search(/window\.__como_rehydration__\s*=/);
    if (assignIdx === -1) continue;

    const braceIdx = content.indexOf('{', assignIdx);
    if (braceIdx === -1) continue;

    const parsed = tryParseJsonFromIndex(content, braceIdx);
    if (parsed) return parsed;
  }

  return null;
}

export function parseProfileImageUrlFromHtml(html: string, targetProfileUrn?: string): string {
  const parsedHtml = new DOMParser().parseFromString(html, 'text/html');
  const rehydrationState = extractRehydrationStateFromHtml(html);
  const rehydrationImageUrl = rehydrationState ? findProfileImageUrl(rehydrationState, targetProfileUrn) : '';
  if (rehydrationImageUrl) {
    return rehydrationImageUrl;
  }

  const codeBlocks = Array.from(parsedHtml.querySelectorAll('code'));
  for (const block of codeBlocks) {
    const raw = block.textContent || '';
    if (!raw.includes('profilePicture') && !raw.includes('profile-displayphoto') && !raw.includes('profile-framedphoto')) {
      continue;
    }

    try {
      const decoded = decodeHtmlEntities(raw);
      const parsed = JSON.parse(decoded);
      const normalized = trimLinkedInValue(parsed);
      const imageUrl = findProfileImageUrl(normalized, targetProfileUrn);
      if (imageUrl) {
        return imageUrl;
      }
    } catch {
      // skip non-JSON code block
    }
  }

  const renderedTopCardImageUrl = extractRenderedTopCardImageUrl(parsedHtml);
  if (renderedTopCardImageUrl) {
    return renderedTopCardImageUrl;
  }

  if (!targetProfileUrn) {
    const decodedHtml = decodeHtmlEntities(html);
    const directImageMatch = decodedHtml.match(/https:\/\/media\.licdn\.com\/[^"'\\<>\s]+profile-(?:displayphoto|framedphoto)[^"'\\<>\s]+/i);
    return directImageMatch?.[0] ? normalizeMediaUrl(directImageMatch[0]) : '';
  }

  return '';
}

function resolveStatusFromRehydrationState(
  state: Record<string, unknown>
): RelationshipResolution | null {
  let memberNumericId: string | undefined;
  let profileUrn: string | undefined;
  let invitationValue: string | null = null;
  let followingValue: string | null = null;

  for (const [key, value] of Object.entries(state)) {
    // invitation state: "state:invitation:urn:li:member:<id>"
    const invMatch = key.match(/^state:invitation:urn:li:member:(\d+)$/);
    if (invMatch) {
      const sv = asString(asRecord(value)?.stringValue);
      if (sv) {
        invitationValue = sv.toLowerCase();
        memberNumericId = memberNumericId || invMatch[1];
      }
      continue;
    }

    // following state: "urn:li:fsd_followingState:urn:li:member:<id>"
    const followMatch = key.match(/^urn:li:fsd_followingState:urn:li:member:(\d+)$/);
    if (followMatch) {
      const sv = asString(asRecord(value)?.stringValue);
      if (sv) {
        followingValue = sv.toLowerCase();
        memberNumericId = memberNumericId || followMatch[1];
      }
      continue;
    }

    // capture first fsd_profile URN seen
    if (!profileUrn && key.startsWith('urn:li:fsd_profile:')) {
      profileUrn = key;
    }
  }

  const isFollowing = followingValue === 'following';
  const canFollow = Boolean(followingValue);

  if (invitationValue === 'pending') {
    return { status: 'pending', profileUrn, memberNumericId, canMessage: false, canFollow, canConnect: false, isFollowing };
  }
  if (invitationValue === 'withdrawn') {
    return { status: 'withdrawn', profileUrn, memberNumericId, canMessage: false, canFollow, canConnect: false, isFollowing };
  }
  if (invitationValue === 'connect') {
    return { status: 'connect', profileUrn, memberNumericId, canMessage: false, canFollow, canConnect: true, isFollowing };
  }
  if (isFollowing) {
    return { status: 'following', profileUrn, memberNumericId, canMessage: false, canFollow: true, canConnect: false, isFollowing: true };
  }

  // "follow" (not yet following) alone is insufficient — need more signals
  return null;
}

export function parseStatusFromRehydration(html: string): RelationshipResolution | null {
  const state = extractRehydrationStateFromHtml(html);
  if (!state) return null;
  return resolveStatusFromRehydrationState(state);
}

function extractMemberNumericId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const match = value.match(/urn:li:member:(\d+)/);
    if (match?.[1]) {
      return match[1];
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractMemberNumericId(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    const directCandidates = [
      record.objectUrn,
      record.targetUrn,
      record.entityUrn,
      record.memberUrn,
      record.viewerUrn,
      record.vieweeUrn,
    ];

    for (const candidate of directCandidates) {
      const direct = extractMemberNumericId(candidate);
      if (direct) {
        return direct;
      }
    }

    for (const nested of Object.values(record)) {
      const resolved = extractMemberNumericId(nested);
      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

function extractFollowingSignal(profile: Record<string, unknown>): boolean {
  if (isFollowingStateActive(profile.followingState)) {
    return true;
  }

  const profileActions = asRecord(profile.profileStatefulProfileActions);
  const primaryAction = asRecord(profileActions?.primaryActionResolutionResult);
  const secondaryAction = asRecord(profileActions?.secondaryActionResolutionResult);

  if (isFollowingStateActive(primaryAction?.followingState) || isFollowingStateActive(secondaryAction?.followingState)) {
    return true;
  }

  const secondaryStatefulAction = asRecord(secondaryAction?.statefulAction);
  const actionDataModel = asRecord(secondaryStatefulAction?.actionDataModel);
  const relationshipActionData = asRecord(actionDataModel?.relationshipActionData);
  const relationshipData = asRecord(relationshipActionData?.relationshipData);
  const memberToEntityRelationship = asRecord(relationshipData?.memberToEntityRelationship);
  const followRelationship = asRecord(asRecord(memberToEntityRelationship?.relationshipData)?.follow);

  if (isFollowingStateActive(followRelationship?.followingState)) {
    return true;
  }

  const overflowActions = asArray(profileActions?.overflowActionsResolutionResults);
  return overflowActions.some((action) => isFollowingStateActive(asRecord(action)?.followingState));
}

function collectEntities(obj: unknown, out: Map<string, unknown>, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 15) return;

  const entityUrn = typeof (obj as { entityUrn?: unknown }).entityUrn === 'string'
    ? (obj as { entityUrn: string }).entityUrn.trim()
    : '';
  if (entityUrn) {
    out.set(entityUrn, obj);
  }

  const items = Array.isArray(obj) ? obj : Object.values(obj);
  for (const item of items) {
    if (item && typeof item === 'object') {
      collectEntities(item, out, depth + 1);
    }
  }
}

function resolveStatusFromEntities(
  entities: Map<string, unknown>
): { status: RelationshipStatus; profileUrn?: string } | null {
  let profileUrn: string | undefined;
  for (const urn of entities.keys()) {
    if (urn.startsWith('urn:li:fsd_profile:')) {
      profileUrn = urn;
      break;
    }
  }

  let mrEntity: Record<string, unknown> | null = null;
  for (const [urn, entity] of entities) {
    if (urn.includes('fsd_memberRelationship:')) {
      mrEntity = asRecord(entity);
      break;
    }
  }

  const memberRelationship = asRecord(mrEntity?.memberRelationship);
  if (!memberRelationship) return null;

  if (asRecord(memberRelationship.self) || asRecord(memberRelationship.connection)) {
    return { status: 'connected', profileUrn };
  }

  const noConnection = asRecord(memberRelationship.noConnection);
  if (!noConnection) return null;

  const invitationContainer = asRecord(noConnection.invitation);
  if (invitationContainer) {
    const invRef = asString(invitationContainer['*invitation']);
    if (invRef) {
      const invEntity = asRecord(entities.get(invRef));
      const invitationState = asString(invEntity?.invitationState);
      const invitationType = asString(invEntity?.invitationType);
      if (invitationState === 'PENDING') {
        return { status: 'pending', profileUrn };
      }
      if (invitationState === 'WITHDRAWN' && invitationType === 'SENT') {
        return { status: 'withdrawn', profileUrn };
      }
    }

    const inlineInvitation = asRecord(invitationContainer.invitation);
    if (inlineInvitation) {
      const invitationState = asString(inlineInvitation.invitationState);
      const invitationType = asString(inlineInvitation.invitationType);
      if (invitationState === 'PENDING') {
        return { status: 'pending', profileUrn };
      }
      if (invitationState === 'WITHDRAWN' && invitationType === 'SENT') {
        return { status: 'withdrawn', profileUrn };
      }
    }
  }

  return { status: 'connect', profileUrn };
}

function resolveStatusFromRelationshipUnion(
  relationship: unknown,
  profileUrn?: string
): { status: RelationshipStatus; profileUrn?: string } | null {
  const memberRelationship = asRecord(relationship);
  if (!memberRelationship) return null;

  if (asRecord(memberRelationship.self) || asRecord(memberRelationship.connection)) {
    return { status: 'connected', profileUrn };
  }

  const noConnection = asRecord(memberRelationship.noConnection);
  if (!noConnection) return null;

  const invitationContainer = asRecord(noConnection.invitation);
  const inlineInvitation = asRecord(invitationContainer?.invitation);
  const invitationState = asString(inlineInvitation?.invitationState);
  const invitationType = asString(inlineInvitation?.invitationType);

  if (invitationState === 'PENDING') {
    return { status: 'pending', profileUrn };
  }

  if (invitationState === 'WITHDRAWN' && invitationType === 'SENT') {
    return { status: 'withdrawn', profileUrn };
  }

  if (invitationContainer?.['*invitation']) {
    return { status: 'pending', profileUrn };
  }

  if (asRecord(invitationContainer?.noInvitation) || invitationContainer?.['*noInvitation']) {
    return { status: 'connect', profileUrn };
  }

  return { status: 'connect', profileUrn };
}

function extractStatusFromProfileEntry(
  profileEntry: unknown
): RelationshipResolution | null {
  const profile = asRecord(profileEntry);
  if (!profile) return null;

  const profileUrn = pickProfileUrn(profile.entityUrn);
  const profileImageUrl = findProfileImageUrl(profile, profileUrn);
  const memberNumericId = extractMemberNumericId(profile);
  let connectCandidate = false;
  const followingActive = extractFollowingSignal(profile);
  const profileActions = asRecord(profile.profileStatefulProfileActions);
  const primaryAction = asRecord(profileActions?.primaryActionResolutionResult);
  const secondaryAction = asRecord(profileActions?.secondaryActionResolutionResult);
  const supplementaryAction = asRecord(profileActions?.supplementaryAction);
  const primaryComposeOptionType = getComposeOptionType(primaryAction);
  const secondaryComposeOptionType = getComposeOptionType(secondaryAction);

  // PREMIUM_INMAIL signals that the viewer can send InMail to this profile.
  // It does NOT indicate the profile is a Premium subscriber — use premiumFeatures for that.
  const isPremiumInMail =
    primaryComposeOptionType === 'PREMIUM_INMAIL' ||
    secondaryComposeOptionType === 'PREMIUM_INMAIL';

  // isPremium: true only when the profile itself carries explicit Premium features.
  // PREMIUM_INMAIL, paidInMail, and UPSELL all describe messaging cost/availability for
  // the viewer — they say nothing about whether the viewed profile is a Premium subscriber.
  const premiumFeaturesRaw = profile.premiumFeatures;
  const hasPremiumFeatures = Array.isArray(premiumFeaturesRaw)
    ? premiumFeaturesRaw.some((f) => {
        const feature = asRecord(f);
        return feature?.hasAccess === true || feature?.hasEnabled === true;
      })
    : Boolean(premiumFeaturesRaw && typeof premiumFeaturesRaw === 'object'
        ? Object.keys(premiumFeaturesRaw as Record<string, unknown>).length > 0
        : premiumFeaturesRaw);
  const isPremium = hasPremiumFeatures || undefined;

  // canMessage: true for regular connections OR when Premium InMail is explicitly available.
  // UPSELL does NOT grant messaging — it is a paid upsell prompt, not an available action.
  const canMessage =
    primaryComposeOptionType === 'CONNECTION_MESSAGE' ||
    secondaryComposeOptionType === 'CONNECTION_MESSAGE' ||
    isPremiumInMail;

  const resolveStatusFromAction = (action: Record<string, unknown> | null): { status: RelationshipStatus; profileUrn?: string } | null => {
    if (!action) return null;

    const directStatefulAction = asRecord(action?.statefulAction);
    const actionDataModel = asRecord(directStatefulAction?.actionDataModel);
    const relationshipActionData = asRecord(actionDataModel?.relationshipActionData);
    const relationshipData = asRecord(relationshipActionData?.relationshipData);
    const connectionOrInvitation = asRecord(relationshipData?.connectionOrInvitation);
    const resolved = resolveStatusFromRelationshipUnion(
      connectionOrInvitation?.memberRelationship ?? connectionOrInvitation,
      profileUrn
    );
    if (resolved) {
      return resolved;
    }

    const wrappedConnection = asRecord(action?.connection);
    const directConnectionStatus = resolveStatusFromRelationshipUnion(
      asRecord(wrappedConnection?.memberRelationship)?.memberRelationship ??
        wrappedConnection?.memberRelationship ??
        wrappedConnection,
      profileUrn
    );
    if (directConnectionStatus) {
      return directConnectionStatus;
    }

    const personalizedConnect = asRecord(action?.personalizedConnect);
    return resolveStatusFromRelationshipUnion(
      personalizedConnect?.memberRelationship ?? personalizedConnect,
      profileUrn
    );
  };

  const prioritizedActions = [primaryAction, secondaryAction, supplementaryAction];
  for (const action of prioritizedActions) {
    const resolvedStatus = resolveStatusFromAction(action);
    if (!resolvedStatus) continue;

    if (resolvedStatus.status === 'connect') {
      connectCandidate = true;
    } else {
      return normalizeRelationshipResolution({
        ...resolvedStatus,
        canMessage,
        isPremium: isPremium || undefined,
        profileImageUrl,
      });
    }
  }

  if (canMessage) {
    return {
      status: isPremiumInMail ? 'connect' : 'connected',
      profileUrn,
      canMessage: true,
      canConnect: false,
      canFollow: false,
      isFollowing: followingActive,
      memberNumericId,
      isPremium: isPremium || undefined,
      profileImageUrl,
    };
  }

  const overflowActions = asArray(profileActions?.overflowActionsResolutionResults);
  for (const action of overflowActions) {
    const overflowStatus = resolveStatusFromAction(asRecord(action));
    if (overflowStatus) {
      if (overflowStatus.status === 'connect') {
        connectCandidate = true;
      } else {
        return normalizeRelationshipResolution({
          ...overflowStatus,
          canMessage,
          isPremium: isPremium || undefined,
          profileImageUrl,
        });
      }
    }
  }

  const canFollow = followingActive || Boolean(
    asRecord(asRecord(primaryAction?.statefulAction)?.actionDataModel)?.relationshipActionData ||
    asRecord(asRecord(secondaryAction?.statefulAction)?.actionDataModel)?.relationshipActionData ||
    asRecord(asRecord(supplementaryAction?.statefulAction)?.actionDataModel)?.relationshipActionData ||
    asRecord(profile.followingState)
  );
  const canConnect = connectCandidate;

  if (followingActive && !canConnect) {
    return {
      status: 'following',
      profileUrn,
      canMessage: false,
      canFollow,
      canConnect,
      isFollowing: true,
      memberNumericId,
      isPremium: isPremium || undefined,
      profileImageUrl,
    };
  }

  if (connectCandidate) {
    return {
      status: 'connect',
      profileUrn,
      canMessage: isPremiumInMail,
      canFollow,
      canConnect: true,
      isFollowing: followingActive,
      memberNumericId,
      isPremium: isPremium || undefined,
      profileImageUrl,
    };
  }

  return null;
}

function enrichFromEntities(
  base: { status: RelationshipStatus; profileUrn?: string },
  entities: Map<string, unknown>
): RelationshipResolution {
  // Extract memberNumericId from entity URNs
  let memberNumericId: string | undefined;
  for (const urn of entities.keys()) {
    const m = urn.match(/urn:li:member:(\d+)/);
    if (m?.[1]) { memberNumericId = m[1]; break; }
  }
  // Fallback: deep-search entity values
  if (!memberNumericId) {
    for (const entity of entities.values()) {
      const id = extractMemberNumericId(entity);
      if (id) { memberNumericId = id; break; }
    }
  }

  const { status, profileUrn } = base;
  return {
    status,
    profileUrn,
    memberNumericId,
    canMessage: status === 'connected',
    canConnect: status === 'connect',
    canFollow: undefined,   // not determinable from code blocks alone
    isFollowing: status === 'following' ? true : undefined,
  };
}

export function parseStatusFromCodeBlocks(html: string): RelationshipResolution | null {
  const allEntities = new Map<string, unknown>();
  const parsedHtml = new DOMParser().parseFromString(html, 'text/html');
  const codeBlocks = Array.from(parsedHtml.querySelectorAll('code'));

  for (const block of codeBlocks) {
    const raw = block.textContent || '';
    if (!raw.includes('fsd_memberRelationship') && !raw.includes('invitationState') && !raw.includes('*memberRelationship')) {
      continue;
    }

    try {
      const decoded = decodeHtmlEntities(raw);
      const parsed = JSON.parse(decoded);
      const normalized = trimLinkedInValue(parsed);
      collectEntities(normalized, allEntities);
    } catch {
      // skip non-JSON code block
    }
  }

  if (allEntities.size === 0) return null;
  const base = resolveStatusFromEntities(allEntities);
  if (!base) return null;
  return enrichFromEntities(base, allEntities);
}

export function parseStatusFromRegex(
  html: string
): (RelationshipResolution & { reason: string }) | null {
  const text = decodeHtmlEntities(html);

  const findStateStringValue = (
    prefixPattern: RegExp,
    valuePattern: RegExp
  ): { memberNumericId?: string; value?: string } | null => {
    const prefixMatch = text.match(prefixPattern);
    if (!prefixMatch) {
      return null;
    }

    const startIndex = prefixMatch.index ?? 0;
    const chunk = text.slice(startIndex, startIndex + 8000);
    const valueMatch = chunk.match(valuePattern);
    if (!valueMatch) {
      return {
        memberNumericId: prefixMatch[1],
      };
    }

    return {
      memberNumericId: prefixMatch[1],
      value: valueMatch[1]?.toLowerCase(),
    };
  };

  const profileUrnMatch = text.match(/urn:li:fsd_profile:[A-Za-z0-9_-]+/);
  const profileUrn = profileUrnMatch?.[0];
  const memberNumericIdMatch = text.match(/urn:li:member:(\d+)/);
  const memberNumericId = memberNumericIdMatch?.[1];
  const invitationState = findStateStringValue(
    /state:invitation:urn:li:member:(\d+)/i,
    /\\?"stringValue\\?"\s*:\s*\\?"(Connect|Pending|Withdrawn)\\?"/i
  );
  const followingState = findStateStringValue(
    /urn:li:fsd_followingState:urn:li:member:(\d+)/i,
    /\\?"stringValue\\?"\s*:\s*\\?"(Follow|Following)\\?"/i
  );
  const hasPendingCta =
    /aria-label="Pending[^"]*withdraw invitation/i.test(text) ||
    />\s*Pending\s*</i.test(text);
  const hasConnectCta =
    /aria-label="Invite [^"]+ to connect"/i.test(text) ||
    /aria-label="Connect[^"]*"/i.test(text) ||
    />\s*Connect\s*</i.test(text);
  const hasFollowCta =
    /aria-label="Follow[^"]*"/i.test(text) ||
    />\s*\+?\s*Follow\s*</i.test(text);
  const hasMessageCta =
    /aria-label="Message [^"]+"/i.test(text) ||
    />\s*Message\s*</i.test(text);
  const hasFirstDegree =
    />\s*1st\s*</i.test(text) ||
    /1st degree connection/i.test(text) ||
    /"memberDistance"\s*:\s*"DISTANCE_1"/.test(text) ||
    /"networkDistance"\s*:\s*1\b/.test(text);
  const hasSecondOrThirdDegree =
    />\s*(?:·|&middot;)?\s*2nd\s*</i.test(text) ||
    />\s*(?:·|&middot;)?\s*3rd(?:\+)?\s*</i.test(text) ||
    /2nd degree connection/i.test(text) ||
    /3rd degree connection/i.test(text) ||
    /"memberDistance"\s*:\s*"DISTANCE_2"/.test(text) ||
    /"memberDistance"\s*:\s*"DISTANCE_3"/.test(text) ||
    /"memberDistance"\s*:\s*"OUT_OF_NETWORK"/.test(text) ||
    /"networkDistance"\s*:\s*(?:2|3)\b/.test(text);

  const invitationMemberNumericId = invitationState?.memberNumericId;
  const invitationStateValue = invitationState?.value || '';
  const followingMemberNumericId = followingState?.memberNumericId;
  const followingStateValue = followingState?.value || '';
  const resolvedMemberNumericId = invitationMemberNumericId || followingMemberNumericId || memberNumericId;
  const isFollowing = followingStateValue === 'following';
  const canFollow = Boolean(followingStateValue);

  if (invitationStateValue === 'pending') {
    return {
      status: 'pending',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'rehydration invitation state = Pending',
    };
  }

  if (invitationStateValue === 'withdrawn') {
    return {
      status: 'withdrawn',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'rehydration invitation state = Withdrawn',
    };
  }

  if (invitationStateValue === 'connect') {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: true,
      isFollowing,
      reason: 'rehydration invitation state = Connect',
    };
  }

  if (followingStateValue === 'following') {
    return {
      status: 'following',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow: true,
      canConnect: false,
      isFollowing: true,
      reason: 'rehydration follow state = Following',
    };
  }

  if (
    /"invitationState"\s*:\s*"PENDING"/.test(text) &&
    /"invitationType"\s*:\s*"SENT"/.test(text)
  ) {
    return {
      status: 'pending',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'invitationState=PENDING + invitationType=SENT',
    };
  }
  if (
    /"invitationState"\s*:\s*"WITHDRAWN"/.test(text) &&
    /"invitationType"\s*:\s*"SENT"/.test(text)
  ) {
    return {
      status: 'withdrawn',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'invitationState=WITHDRAWN + invitationType=SENT',
    };
  }
  if (hasPendingCta) {
    return {
      status: 'pending',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'pending CTA in HTML',
    };
  }

  const mrIdx = text.indexOf('fsd_memberRelationship:');
  if (mrIdx !== -1) {
    const chunk = text.slice(mrIdx, mrIdx + 800);

    if (/"connection"\s*:\s*\{/.test(chunk) || /"\*connection"\s*:\s*"urn:/.test(chunk)) {
      return {
        status: 'connected',
        profileUrn,
        memberNumericId: resolvedMemberNumericId,
        canMessage: true,
        canFollow,
        canConnect: false,
        isFollowing,
        reason: 'fsd_memberRelationship.connection object',
      };
    }
    if (/"connection"\s*:\s*null/.test(chunk)) {
      return {
        status: 'connect',
        profileUrn,
        memberNumericId: resolvedMemberNumericId,
        canMessage: false,
        canFollow,
        canConnect: true,
        isFollowing,
        reason: 'fsd_memberRelationship.connection=null',
      };
    }
  }

  const hasPremiumInMailJson = /"composeOptionType"\s*:\s*"PREMIUM_INMAIL"/.test(text);
  const hasUpsellJson = /"composeOptionType"\s*:\s*"UPSELL"/.test(text);

  if (hasFirstDegree || (hasMessageCta && !hasConnectCta && !hasSecondOrThirdDegree && !hasPremiumInMailJson && !hasUpsellJson)) {
    return {
      status: 'connected',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: true,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'message CTA or 1st-degree markers in HTML',
    };
  }
  if (hasFollowCta && hasSecondOrThirdDegree) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow: true,
      canConnect: true,
      isFollowing: false,
      reason: 'follow CTA + non-1st-degree markers in HTML',
    };
  }
  if (hasConnectCta) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: hasPremiumInMailJson,  // UPSELL does not enable messaging
      canFollow,
      canConnect: true,
      isFollowing,
      // PREMIUM_INMAIL indicates InMail availability for the viewer, not a Premium badge on the profile.
      reason: hasPremiumInMailJson ? 'connect CTA + PREMIUM_INMAIL in HTML' : 'connect CTA in HTML',
    };
  }

  // PREMIUM_INMAIL detected in embedded JSON: profile supports InMail messaging.
  // isPremium is NOT set here — PREMIUM_INMAIL signals InMail availability for the viewer,
  // not a Premium badge on the viewed profile. The structured path is authoritative for isPremium.
  if (hasMessageCta && hasPremiumInMailJson) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: true,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'PREMIUM_INMAIL composeOptionType in HTML',
    };
  }

  // UPSELL detected: messaging is locked behind a paid upsell.
  // canMessage = false. isPremium is NOT set here — UPSELL does not identify the
  // profile as a Premium subscriber; the structured parser path is authoritative for that.
  if (hasUpsellJson) {
    return {
      status: 'connect',
      profileUrn,
      memberNumericId: resolvedMemberNumericId,
      canMessage: false,
      canFollow,
      canConnect: false,
      isFollowing,
      reason: 'UPSELL composeOptionType in HTML',
    };
  }

  return null;
}

export function parseGraphQLRelationshipStatus(
  payload: unknown
): RelationshipResolution | null {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const collection = asRecord(data?.identityDashProfilesByMemberIdentity);
  const elements = asArray(collection?.elements);

  for (const element of elements) {
    const result = extractStatusFromProfileEntry(element);
    if (result) {
      return result;
    }
  }

  return null;
}
