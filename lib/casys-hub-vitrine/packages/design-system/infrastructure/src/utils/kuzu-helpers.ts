/**
 * Utilitaires pour les adaptateurs Kuzu
 * Gestion de l'échappement et formatage des requêtes Cypher
 */

/**
 * Échappe une chaîne pour l'utilisation dans une requête Cypher
 * Gère les apostrophes, guillemets et caractères spéciaux
 */
export function escapeCypherString(value: string): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  return (
    value
      // Échapper les antislashs d'abord (pour éviter de doubler les échappements)
      .replace(/\\/g, '\\\\')
      // Échapper les apostrophes avec antislash
      .replace(/'/g, "\\'")
      // Échapper les guillemets
      .replace(/"/g, '\\"')
      // Échapper les retours à la ligne
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      // Échapper les tabulations
      .replace(/\t/g, '\\t')
  );
}

/**
 * Sécurise un identifiant Cypher (nom de table, colonne, etc.)
 * Utilise des backticks pour éviter les conflits avec les mots réservés
 * et empêcher l'injection d'identifiants malveillants
 */
export function safeCypherIdentifier(identifier: string): string {
  if (typeof identifier !== 'string') {
    throw new Error('Identifier must be a string');
  }

  // Supprimer les caractères dangereux et garder seulement alphanumériques + underscore
  const cleanIdentifier = identifier.replace(/[^a-zA-Z0-9_]/g, '');

  if (cleanIdentifier.length === 0) {
    throw new Error('Identifier cannot be empty after sanitization');
  }

  // Entourer de backticks pour la sécurité
  return `\`${cleanIdentifier}\``;
}

/**
 * @deprecated Utiliser formatKuzuValue pour Kuzu 0.11+ avec extension JSON
 * Formate une valeur pour l'insertion dans une requête Cypher (ancien format)
 * Gère les types primitifs et les objets JSON
 */
export function formatCypherValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return `'${escapeCypherString(value)}'`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    // DEPRECATED: Format Cypher classique incompatible avec Kuzu 0.11 JSON
    const escapedItems = value.map(item =>
      typeof item === 'string' ? `'${escapeCypherString(item)}'` : String(item)
    );
    return `[${escapedItems.join(', ')}]`;
  }

  if (typeof value === 'object') {
    // DEPRECATED: Sérialisation manuelle incompatible avec Kuzu 0.11 JSON
    const jsonString = JSON.stringify(value);
    return `'${escapeCypherString(jsonString)}'`;
  }

  // Fallback pour les cas non gérés (ne devrait pas arriver avec les types ci-dessus)
  return 'null';
}

/**
 * Construit une clause SET pour une requête Cypher UPDATE
 * @param properties - Objet contenant les propriétés à mettre à jour
 * @param nodeVariable - Variable du nœud dans la requête (par défaut 'n')
 */
export function buildCypherSetClause(
  properties: Record<string, unknown>,
  nodeVariable = 'n'
): string {
  const setPairs = Object.entries(properties)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${nodeVariable}.${key} = ${formatCypherValue(value)}`);

  return setPairs.length > 0 ? `SET ${setPairs.join(', ')}` : '';
}

/**
 * Construit les propriétés d'un nœud pour une requête CREATE
 * @param properties - Objet contenant les propriétés du nœud
 */
export function buildCypherNodeProperties(properties: Record<string, unknown>): string {
  const propPairs = Object.entries(properties)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatCypherValue(value)}`);

  return `{${propPairs.join(', ')}}`;
}

/**
 * Valide et nettoie un identifiant pour Cypher
 * Les identifiants doivent commencer par une lettre et ne contenir que des lettres, chiffres et underscores
 */
export function sanitizeCypherIdentifier(identifier: string): string {
  // Remplacer les caractères non autorisés par des underscores
  let sanitized = identifier.replace(/[^a-zA-Z0-9_]/g, '_');

  // S'assurer que l'identifiant commence par une lettre
  if (!/^[a-zA-Z]/.test(sanitized)) {
    sanitized = `id_${sanitized}`;
  }

  return sanitized;
}

/**
 * Helper pour construire une requête CREATE complète
 */
export function buildCreateNodeQuery(
  nodeType: string,
  properties: Record<string, unknown>,
  nodeVariable = 'n'
): string {
  const nodeProps = buildCypherNodeProperties(properties);
  return `CREATE (${nodeVariable}:${nodeType} ${nodeProps})`;
}

/**
 * Helper pour construire une requête MERGE complète
 */
export function buildMergeNodeQuery(
  nodeType: string,
  matchProperties: Record<string, unknown>,
  setProperties?: Record<string, unknown>,
  nodeVariable = 'n'
): string {
  const matchProps = buildCypherNodeProperties(matchProperties);
  let query = `MERGE (${nodeVariable}:${nodeType} ${matchProps})`;

  if (setProperties && Object.keys(setProperties).length > 0) {
    const setClause = buildCypherSetClause(setProperties, nodeVariable);
    if (setClause) {
      query += ` ${setClause}`;
    }
  }

  return query;
}

/**
 * Logs une requête Cypher de manière formatée pour le debug
 */
export function logCypherQuery(query: string, params?: Record<string, unknown>): void {
  const lines: string[] = [];
  lines.push('🔍 Cypher Query:');
  lines.push(query);
  if (params && Object.keys(params).length > 0) {
    lines.push(`📋 Parameters: ${JSON.stringify(params)}`);
  }
  lines.push('---');
  process.stdout.write(lines.join('\n') + '\n');
}
