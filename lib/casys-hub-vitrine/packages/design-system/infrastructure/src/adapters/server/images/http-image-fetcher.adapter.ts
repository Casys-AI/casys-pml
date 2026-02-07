import type { ImageFetcherPort } from '@casys/application';

/**
 * Fetcher HTTP minimaliste pour récupérer des images en mémoire.
 * Fail-fast si URL invalide, HTTP non 2xx, ou contenu vide.
 */
export class HttpImageFetcherAdapter implements ImageFetcherPort {
  async fetch(url: string): Promise<{ data: Uint8Array; mimeType?: string }> {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('[HttpImageFetcher] URL invalide (http/https requis)');
    }

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`[HttpImageFetcher] HTTP ${res.status} lors du téléchargement de ${url}`);
    }

    const contentType = res.headers.get('content-type') ?? undefined;
    const ab = await res.arrayBuffer();
    const data = new Uint8Array(ab);
    if (!data || data.byteLength === 0) {
      throw new Error('[HttpImageFetcher] Contenu image vide');
    }

    // Normalise le type MIME (sans paramètres charset, etc.)
    const mimeType = contentType?.split(';')[0]?.trim();
    return { data, mimeType };
  }
}
