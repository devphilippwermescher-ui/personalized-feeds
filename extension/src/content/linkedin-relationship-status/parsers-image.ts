import { asArray, asRecord, asString, decodeHtmlEntities, pickProfileUrn, trimLinkedInValue } from './utils';
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

export function findProfileImageUrl(value: unknown, targetProfileUrn?: string): string {
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

export function extractRehydrationStateFromHtml(html: string): Record<string, unknown> | null {
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
