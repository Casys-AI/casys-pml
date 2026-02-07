import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../utils/logger';

// ESM: get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const YAML_CONFIG_FILENAME = 'sources.yaml';
const COMPONENTS_BASE_FILENAME = 'components-base.json';
const logger = createLogger('InfraConfigLoader');

/**
 * Charge la configuration depuis le fichier sources.yaml local au package infrastructure.
 */
interface SourcesYaml {
  rss_sources?: unknown[];
  news_api_sources?: unknown[];
  default_config?: Record<string, unknown>;
}

export const configLoader = () => {
  // Le chemin est relatif au dossier de ce fichier (config/)
  // En dev: src/config/, en prod: dist/config/
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = join(__dirname, YAML_CONFIG_FILENAME);

  try {
    const configFile = readFileSync(configPath, 'utf8');
    const raw: unknown = yaml.load(configFile);
    const parsedConfig: SourcesYaml = raw && typeof raw === 'object' ? (raw as SourcesYaml) : {};

    // Transformer les clés snake_case du YAML en camelCase pour la config
    return {
      RSS_SOURCES: parsedConfig.rss_sources ?? [],
      NEWS_API_SOURCES: parsedConfig.news_api_sources ?? [],
      ...(parsedConfig.default_config ?? {}),
    };
  } catch (error) {
    logger.error(
      `[Infra/ConfigLoader] Erreur lors du chargement de ${configPath}: ${String(error)}`
    );
    // Retourner une configuration vide ou par défaut pour éviter de planter
    return {
      RSS_SOURCES: [],
      NEWS_API_SOURCES: [],
    };
  }
};

/**
 * Interface pour le catalogue de base des composants
 */
export interface ComponentBaseCatalog {
  version: string;
  description: string;
  last_updated: string;
  available_components: Record<
    string,
    {
      description: string;
      category: string;
      subcategory: string;
      file_path: string;
      props: Record<
        string,
        {
          type: string;
          required: boolean;
          default?: string;
          description?: string;
        }
      >;
      tags: string[];
      useCases: string[];
      related: string[];
    }
  >;
}

/**
 * Interface pour la configuration tenant
 */
export interface TenantComponentConfig {
  tenant_id: string;
  created_at: string;
  updated_at: string;
  selected_components: string[] | 'default'; // Support pour "default" = tous les composants
  excluded_components?: string[];
}

/**
 * Charge le catalogue de base des composants
 */
export const loadComponentBaseCatalog = (): ComponentBaseCatalog => {
  // Utiliser le même pattern de chemin que pour les fichiers YAML
  const catalogPath = join(__dirname, 'config', COMPONENTS_BASE_FILENAME);

  logger.debug(`[DEBUG] Tentative de chargement du catalogue depuis: ${catalogPath}`);
  logger.debug(`[DEBUG] __dirname = ${__dirname}`);
  logger.debug(`[DEBUG] Existence du fichier: ${existsSync(catalogPath) ? 'OUI' : 'NON'}`);

  try {
    const catalogFile = readFileSync(catalogPath, 'utf8');
    logger.debug(`[DEBUG] Catalogue chargé avec succès, taille: ${catalogFile.length} caractères`);
    return JSON.parse(catalogFile) as ComponentBaseCatalog;
  } catch (error) {
    logger.error(
      `[Infra/ConfigLoader] Erreur lors du chargement de ${catalogPath}: ${String(error)}`
    );
    throw new Error(`Failed to load component base catalog: ${String(error)}`);
  }
};

/**
 * Charge la configuration tenant depuis un fichier JSON
 */
export const loadTenantComponentConfig = (
  tenantId: string,
  configPath?: string
): TenantComponentConfig => {
  const defaultPath = join(__dirname, `tenant-${tenantId}.json`);
  const finalPath = configPath ?? defaultPath;

  try {
    const configFile = readFileSync(finalPath, 'utf8');
    return JSON.parse(configFile) as TenantComponentConfig;
  } catch (error) {
    // logger already defined at module scope
    logger.error(
      `[Infra/ConfigLoader] Erreur lors du chargement de ${finalPath}: ${String(error)}`
    );
    throw new Error(`Failed to load tenant config for ${tenantId}: ${String(error)}`);
  }
};

/**
 * Sauvegarde la configuration tenant dans un fichier JSON
 */
export const saveTenantComponentConfig = (
  config: TenantComponentConfig,
  configPath?: string
): void => {
  const defaultPath = join(__dirname, `tenant-${config.tenant_id}.json`);
  const finalPath = configPath ?? defaultPath;

  try {
    const configJson = JSON.stringify(config, null, 2);
    writeFileSync(finalPath, configJson, 'utf8');
    // logger already defined at module scope
    logger.log(`[Infra/ConfigLoader] Configuration sauvegardée pour ${config.tenant_id}`);
  } catch (error) {
    // logger already defined at module scope
    logger.error(
      `[Infra/ConfigLoader] Erreur lors de la sauvegarde de ${finalPath}: ${String(error)}`
    );
    throw new Error(`Failed to save tenant config for ${config.tenant_id}: ${String(error)}`);
  }
};
