import { franc } from 'franc-min';

import { createLogger } from '../../../utils/logger';

/**
 * Adaptateur de détection de langue
 * Utilise franc pour détecter 82 langues
 */
export class LanguageDetectorAdapter {
  private readonly logger = createLogger('LanguageDetectorAdapter');

  /**
   * Détecte la langue d'un texte
   * @param text Texte à analyser (minimum 10 caractères recommandé)
   * @returns Code ISO 639-1 (ex: 'fr', 'en', 'zh', 'ja', 'ko')
   */
  detect(text: string): string {
    if (!text || text.length < 10) {
      this.logger.warn?.(`⚠️ Text too short (${text?.length ?? 0} chars), defaulting to en`);
      return 'en';
    }

    // Prendre un échantillon (premiers 2000 chars pour performance)
    const sample = text.slice(0, 2000);
    const preview = sample.slice(0, 100).replace(/\n/g, ' ');

    // Détecter avec franc (retourne ISO 639-3)
    const detected = franc(sample);

    // franc retourne 'und' si indéterminé
    if (detected === 'und') {
      this.logger.debug?.(`❓ Language undetermined from text: "${preview}...", defaulting to en`);
      return 'en';
    }

    // Convertir ISO 639-3 → ISO 639-1
    const iso639_1 = this.convertToISO639_1(detected);

    this.logger.debug?.(`🔍 Franc detected: ${detected} → ${iso639_1} | Sample: "${preview}..."`);

    return iso639_1;
  }

  /**
   * Convertit ISO 639-3 (franc) → ISO 639-1 (standard)
   */
  private convertToISO639_1(iso639_3: string): string {
    const mapping: Record<string, string> = {
      // Langues principales
      'eng': 'en', // Anglais
      'fra': 'fr', // Français
      'spa': 'es', // Espagnol
      'deu': 'de', // Allemand
      'ita': 'it', // Italien
      'por': 'pt', // Portugais
      'nld': 'nl', // Néerlandais
      'pol': 'pl', // Polonais
      'rus': 'ru', // Russe
      'ukr': 'uk', // Ukrainien
      
      // Langues asiatiques
      'cmn': 'zh', // Chinois Mandarin (simplifié + traditionnel)
      'jpn': 'ja', // Japonais
      'kor': 'ko', // Coréen
      'tha': 'th', // Thaï
      'vie': 'vi', // Vietnamien
      'hin': 'hi', // Hindi
      'ben': 'bn', // Bengali
      
      // Langues arabes
      'arb': 'ar', // Arabe standard
      'fas': 'fa', // Persan
      'urd': 'ur', // Ourdou
      
      // Autres
      'swe': 'sv', // Suédois
      'dan': 'da', // Danois
      'nor': 'no', // Norvégien
      'fin': 'fi', // Finnois
      'tur': 'tr', // Turc
      'heb': 'he', // Hébreu
    };

    return mapping[iso639_3] || iso639_3.slice(0, 2) || 'en';
  }

  /**
   * Détecte la langue de plusieurs textes et retourne la plus fréquente
   */
  detectFromMultiple(texts: string[]): string {
    const languages = texts
      .filter(t => t && t.length > 10)
      .map(t => this.detect(t));

    if (languages.length === 0) return 'en';

    // Compter les occurrences
    const counts = languages.reduce((acc, lang) => {
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Retourner la plus fréquente
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0];
  }
}
