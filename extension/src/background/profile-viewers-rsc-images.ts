function parseJsonString(rawValue: string): string {
  try {
    return JSON.parse(`"${rawValue}"`) as string;
  } catch {
    return '';
  }
}

export function extractProfileViewerImageUrls(payload: string): Map<string, string> {
  const imageUrls = new Map<string, string>();
  const componentPattern = /"a11yText":"((?:\\.|[^"\\])*)","shape":"circle"/g;
  const components = Array.from(payload.matchAll(componentPattern));

  components.forEach((component, index) => {
    const componentStart = component.index || 0;
    const componentEnd = components[index + 1]?.index || payload.length;
    const componentPayload = payload.slice(componentStart, componentEnd);
    const renderPayloadMatch = componentPayload.match(
      /"renderPayload":\{"rootUrl":"((?:\\.|[^"\\])*)","imageRenditions":\[((?:.|\r|\n){1,8000}?)\],"assetUrn"/
    );
    if (!renderPayloadMatch) {
      return;
    }

    const displayName = parseJsonString(component[1]).trim().toLowerCase();
    const rootUrl = parseJsonString(renderPayloadMatch[1]);
    const renditions = renderPayloadMatch[2];
    const preferredRendition =
      renditions.match(
        /\{"width":100,"height":100,"suffixUrl":"((?:\\.|[^"\\])*)"/
      ) || renditions.match(/"suffixUrl":"((?:\\.|[^"\\])*)"/);
    const suffixUrl = preferredRendition ? parseJsonString(preferredRendition[1]) : '';
    const profileImageUrl = `${rootUrl}${suffixUrl}`.replace(/\\\//g, '/');

    if (displayName && /^https:\/\/media\.licdn\.com\//i.test(profileImageUrl)) {
      imageUrls.set(displayName, profileImageUrl);
    }
  });

  return imageUrls;
}
