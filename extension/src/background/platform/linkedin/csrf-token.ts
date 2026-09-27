function getChromeCookie(details: chrome.cookies.Details): Promise<chrome.cookies.Cookie | null> {
  if (!chrome.cookies?.get) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    chrome.cookies.get(details, (cookie) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(cookie || null);
    });
  });
}

export async function getLinkedInCsrfToken(): Promise<string> {
  const jsessionId = await getChromeCookie({
    url: 'https://www.linkedin.com',
    name: 'JSESSIONID',
  });

  return (jsessionId?.value || '').replace(/^"|"$/g, '');
}
