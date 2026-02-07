/**
 * Utilitaires pour manipuler les domaines et URLs
 */

/**
 * Extrait le domaine d'une URL
 * @param url URL complète
 * @returns Nom de domaine (ex: 'example.com') ou null si invalide
 */
export function extractDomain(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Extrait les domaines de plusieurs URLs
 * @param urls Liste d'URLs
 * @returns Liste de domaines uniques (filtre les invalides)
 */
export function extractDomains(urls: string[]): string[] {
  const domains = new Set<string>();
  
  urls.forEach(url => {
    const domain = extractDomain(url);
    if (domain) {
      domains.add(domain);
    }
  });

  return Array.from(domains);
}

/**
 * Vérifie si deux URLs sont du même domaine
 * @param url1 Première URL
 * @param url2 Deuxième URL
 * @returns true si même domaine
 */
export function isSameDomain(url1: string, url2: string): boolean {
  const domain1 = extractDomain(url1);
  const domain2 = extractDomain(url2);
  
  return domain1 !== null && domain1 === domain2;
}

/**
 * Normalise un domaine (retire www., etc.)
 * @param domain Nom de domaine
 * @returns Domaine normalisé
 */
export function normalizeDomain(domain: string): string {
  return domain.replace(/^www\./, '').toLowerCase();
}
