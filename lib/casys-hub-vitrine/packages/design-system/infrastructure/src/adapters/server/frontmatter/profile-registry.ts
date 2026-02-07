import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface FrontmatterProfile {
  name: string;
  target: string;
  required?: string[];
  mapping: Record<string, string>; // canonicalKey -> targetPath (dot-separated)
  defaults?: Record<string, unknown>;
  /** Notes de documentation libre (non utilisée au runtime) */
  notes?: string;
}

function assertNonEmpty(value: unknown, msg: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(msg);
  }
}

export async function loadFrontmatterProfile(
  target: string,
  profileName: string
): Promise<FrontmatterProfile> {
  assertNonEmpty(profileName, `[FrontmatterProfileRegistry] profile requis pour target ${target}`);

  const blueprintsRoot = process.env.CASYS_BLUEPRINTS_ROOT ?? process.env.CASYS_PROJECT_ROOT;
  assertNonEmpty(
    blueprintsRoot,
    '[FrontmatterProfileRegistry] CASYS_BLUEPRINTS_ROOT (ou CASYS_PROJECT_ROOT) requis pour charger les blueprints'
  );

  const profilePath = path.join(
    blueprintsRoot,
    'config',
    'blueprints',
    'frontmatter',
    target,
    profileName,
    'profile.yml'
  );
  let fileContent: string;
  try {
    fileContent = await fs.readFile(profilePath, 'utf-8');
  } catch (_e) {
    throw new Error(
      `[FrontmatterProfileRegistry] profil frontmatter introuvable pour target ${target}: "${profileName}" (path: ${profilePath})`
    );
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(fileContent);
  } catch (_e) {
    throw new Error(`[FrontmatterProfileRegistry] YAML invalide dans ${profilePath}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`[FrontmatterProfileRegistry] profil mal formé dans ${profilePath}`);
  }
  const profile = parsed as FrontmatterProfile;
  if (profile.target !== target) {
    throw new Error(
      `[FrontmatterProfileRegistry] mismatch target: profil ${profile.name} déclare target "${profile.target}", attendu "${target}"`
    );
  }
  if (!profile.mapping || typeof profile.mapping !== 'object') {
    throw new Error(`[FrontmatterProfileRegistry] mapping manquant dans le profil ${profile.name}`);
  }
  return profile;
}
