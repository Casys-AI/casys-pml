export interface ImageFetcherPort {
  /**
   * Récupère une image distante et retourne les octets avec son type MIME détecté.
   * Fail-fast si l'URL est vide, si le status HTTP n'est pas 2xx, ou si le contenu est vide.
   */
  fetch(url: string): Promise<{ data: Uint8Array; mimeType?: string }>;
}
