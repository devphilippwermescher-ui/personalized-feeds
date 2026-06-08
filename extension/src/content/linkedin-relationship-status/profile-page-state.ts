import { decodeHtmlEntities } from './utils';

export function isLinkedInProfileUnavailableHtml(html: string): boolean {
  const decodedHtml = decodeHtmlEntities(html);

  return (
    /<meta[^>]+name=["']como-pk["'][^>]+content=["']d_flagship3_404["'][^>]*>/i.test(decodedHtml) ||
    /<meta[^>]+content=["']d_flagship3_404["'][^>]+name=["']como-pk["'][^>]*>/i.test(decodedHtml) ||
    /This page doesn['’]t exist/i.test(decodedHtml) ||
    /Please check your URL or return to LinkedIn home/i.test(decodedHtml)
  );
}
