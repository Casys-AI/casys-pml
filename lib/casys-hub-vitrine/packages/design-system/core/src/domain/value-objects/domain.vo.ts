/**
 * Value Object pour un nom de domaine
 * Garantit la validité et la sécurité du domain
 * 
 * @example
 * const domain = Domain.create('example.com');
 * console.log(domain.value); // 'example.com'
 * console.log(domain.xmlSafe); // 'example.com' (échappé si nécessaire)
 */
export class Domain {
  private readonly _value: string;
  
  private constructor(value: string) {
    this._value = value;
  }
  
  /**
   * Crée un Domain depuis une string (avec validation)
   * Fail-fast si le domain est invalide
   */
  static create(value: unknown): Domain {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('[Domain] Invalid domain: must be a non-empty string');
    }
    
    const normalized = value.trim().toLowerCase();
    
    // Validation basique de format domain (permet sous-domaines)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(normalized)) {
      throw new Error(`[Domain] Invalid domain format: ${normalized}`);
    }
    
    return new Domain(normalized);
  }
  
  /**
   * Retourne la valeur du domain (normalisée et safe)
   */
  get value(): string {
    return this._value;
  }
  
  /**
   * Retourne la valeur échappée pour XML/POML
   * Protège contre les injections XML dans les prompts
   */
  get xmlSafe(): string {
    return this._value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  /**
   * Pour affichage/logging
   */
  toString(): string {
    return this._value;
  }
  
  /**
   * Comparaison d'égalité
   */
  equals(other: Domain): boolean {
    return this._value === other._value;
  }
}
