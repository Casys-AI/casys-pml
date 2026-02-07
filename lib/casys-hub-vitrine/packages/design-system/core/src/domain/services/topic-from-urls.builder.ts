import type { Topic } from '../entities/topic.entity';

/**
 * Builder pur (domaine) pour construire des Topics à partir d'URLs
 * Pas de dépendances externes, logique métier pure
 */
export class TopicFromUrlsBuilder {
  /**
   * Construit des Topics minimaux à partir d'une liste d'URLs
   * @param urls Liste d'URLs sources
   * @param language Langue du contenu (ex: 'fr', 'en')
   * @returns Topics avec id, title (hostname), sourceUrl, language
   */
  build(urls: string[], language: string): Topic[] {
    return urls.map(u => {
      let title = u;
      try {
        const url = new URL(u);
        title = url.hostname || u;
      } catch {
        // garder u comme titre si URL invalide
      }

      return {
        id: this.buildTopicIdFromUrl(u),
        title: title.slice(0, 240),
        createdAt: new Date().toISOString(),
        language,
        sourceUrl: u,
        imageUrls: undefined,
        sourceContent: '',
      } as Topic;
    });
  }

  /**
   * Génère un ID stable pour un topic basé sur son URL source
   * @param url URL source du topic
   * @returns ID normalisé (topic_<hash>)
   */
  private buildTopicIdFromUrl(url: string): string {
    // Normaliser l'URL pour éviter les doublons (trailing slash, protocole, etc.)
    let normalized = url.trim().toLowerCase();
    try {
      const parsed = new URL(normalized);
      normalized = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, '');
    } catch {
      // Si URL invalide, utiliser la chaîne brute
      normalized = normalized.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }

    // Hash simple pour ID stable
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `topic_${Math.abs(hash).toString(36)}`;
  }
}
