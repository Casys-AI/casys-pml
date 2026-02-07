import type { CanonicalFrontmatter } from './canonical-builder';
import type { FrontmatterProfile } from './profile-registry';

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (
      !Object.prototype.hasOwnProperty.call(cur, p) ||
      typeof cur[p] !== 'object' ||
      cur[p] === null
    ) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function getByPathLocal(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const rec = cur as Record<string, unknown>;
    cur = rec[part];
  }
  return cur;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function resolveFieldRefs(
  value: unknown,
  canonical: CanonicalFrontmatter,
  path: string[] = []
): unknown {
  // {$ref: 'canonicalKey'}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    if ('$ref' in rec) {
      const refKey = rec.$ref;
      if (typeof refKey !== 'string' || !refKey.trim()) {
        throw new Error(`[FrontmatterProfile] $ref invalide à ${path.join('.')} (string attendu)`);
      }
      const val = getByPathLocal(canonical as unknown as Record<string, unknown>, refKey);
      if (val === undefined) {
        throw new Error(`[FrontmatterProfile] $ref inconnu: ${refKey}`);
      }
      return val;
    }
    // Parcours récursif
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      copy[k] = resolveFieldRefs(v, canonical, [...path, k]);
    }
    return copy;
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => resolveFieldRefs(v, canonical, [...path, String(i)]));
  }
  return value;
}

export function applyProfileToCanonical(
  canonical: CanonicalFrontmatter,
  profile: FrontmatterProfile,
  extraFields?: Record<string, unknown>
): Record<string, unknown> {
  // Valider required canoniques
  if (profile.required?.length) {
    for (const key of profile.required) {
      if (
        !(key in canonical) ||
        (canonical as unknown as Record<string, unknown>)[key] === undefined
      ) {
        throw new Error(`[FrontmatterProfile] champ canonique requis manquant: ${key}`);
      }
    }
  }

  // Defaults
  const result: Record<string, unknown> = {};
  if (profile.defaults) {
    for (const [k, v] of Object.entries(profile.defaults)) {
      setByPath(result, k, v);
    }
  }

  // Si extraFields contient des $ref, on veut que ces refs "remplacent" les sorties issues
  // du mapping pour le même canonique (pas de doublon). On collecte donc les canoniques
  // référencés dans extraFields AVANT de résoudre les refs.
  const replacedCanonicals = new Set<string>();

  function collectRefCanonicals(value: unknown): void {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const v of value) collectRefCanonicals(v);
      return;
    }
    if (typeof value === 'object') {
      const rec = value as Record<string, unknown>;
      if ('$ref' in rec) {
        const refKey = rec.$ref;
        if (typeof refKey !== 'string' || !refKey.trim()) {
          throw new Error(`[FrontmatterProfile] $ref invalide (string attendu)`);
        }
        replacedCanonicals.add(refKey);
      }
      for (const v of Object.values(rec)) collectRefCanonicals(v);
    }
  }

  // Garde-fou: interdire les clés se terminant par ".$ref" (dot-notation erronée)
  if (extraFields) {
    for (const key of Object.keys(extraFields)) {
      if (key.endsWith('.$ref')) {
        throw new Error(
          `[FrontmatterProfile] clé invalide dans fields: "${key}". Utilisez { $ref: "canonical" } comme valeur, pas la dot-notation.`
        );
      }
    }
    collectRefCanonicals(extraFields);
  }

  // Mapping canonical -> target, en sautant ceux dont le canonique est remplacé par un $ref dans fields
  for (const [src, dst] of Object.entries(profile.mapping || {})) {
    if (replacedCanonicals.has(src)) continue;
    const val = getByPathLocal(canonical as unknown as Record<string, unknown>, src);
    if (val !== undefined) setByPath(result, dst, val);
  }

  // Merge extra fields (après avoir empêché les doublons)
  if (extraFields) {
    const resolved = resolveFieldRefs(deepClone(extraFields), canonical) as Record<string, unknown>;
    for (const [k, v] of Object.entries(resolved)) {
      setByPath(result, k, v);
    }
  }

  return result;
}
