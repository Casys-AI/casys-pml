import { glob } from 'glob';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../../../utils/logger';

export interface ExtractorOptions {
  rootDir: string;
  outputFile?: string;
  include?: string[];
  exclude?: string[];
  tenantId?: string; // Identifiant du tenant (utilisateur, projet...)
}

export interface PropDefinition {
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  filePath: string;
  description: string;
  props: Record<string, PropDefinition>;
  tags: string[];
  useCases: string[];
  related?: string[];
  tenantId?: string; // Pour le multi-tenant
}

// Métadonnées extraites des JSDoc des composants Astro
interface JsdocMetadata {
  category?: string;
  subcategory?: string;
  description?: string;
  tags?: string[];
  useCases?: string[];
  related?: string[];
}

const INTERFACE_REGEX = /export\s+interface\s+(\w+)Props\s*\{([^}]*)\}/s;
const JSDOC_REGEX = /\/\*\*\s*([\s\S]*?)\s*\*\/\s*export\s+interface/;
const DEFAULT_VALUE_REGEX = /=\s*([^,;]+)/;

export class ComponentExtractor {
  private readonly logger = createLogger('ComponentExtractor');

  constructor(private readonly options: ExtractorOptions) {}

  async extractComponents(): Promise<ComponentDefinition[]> {
    this.logger.log(`Starting component extraction from ${this.options.rootDir}`);

    // 1. Trouver tous les fichiers Astro dans le scope
    const patterns = this.options.include?.length
      ? this.options.include.map(p => path.join(this.options.rootDir, p, '**/*.astro'))
      : [path.join(this.options.rootDir, '**/*.astro')];

    const files = await glob(patterns, {
      ignore: [
        ...(this.options.exclude ?? []).map(e => path.join(this.options.rootDir, e, '**/*.astro')),
        '**/node_modules/**',
      ],
    });

    this.logger.log(`Found ${files.length} component files`);

    // 2. Extraire les informations de chaque fichier
    const components: ComponentDefinition[] = [];

    for (const file of files) {
      try {
        const relativePath = path.relative(this.options.rootDir, file);
        const component = await this.extractComponentInfo(file, relativePath);
        if (component) {
          // Ajouter le tenantId si spécifié
          if (this.options.tenantId) {
            component.tenantId = this.options.tenantId;
          }
          components.push(component);
        }
      } catch (e) {
        this.logger.error(`Error extracting component from ${file}: ${String(e)}`);
      }
    }

    this.logger.log(`Successfully extracted ${components.length} components`);

    // 3. Écrire le JSON si un fichier de sortie est spécifié
    if (this.options.outputFile) {
      await this.writeComponentsJson(components);
    }

    return components;
  }

  private async extractComponentInfo(
    fullPath: string,
    relativePath: string
  ): Promise<ComponentDefinition | null> {
    const content = await fs.readFile(fullPath, 'utf-8');

    // Extraire l'interface TypeScript
    const interfaceMatch = INTERFACE_REGEX.exec(content);
    if (!interfaceMatch) {
      this.logger.warn(`No interface found in ${relativePath}`);
      return null;
    }

    const interfaceName = interfaceMatch[1];
    const propsContent = interfaceMatch[2];

    // Extraire les métadonnées JSDoc si présentes
    const jsdocMetadata = this.extractJSDocMetadata(content);

    // Extraire les catégories depuis le chemin
    const pathParts = relativePath.split(path.sep);
    const category: string =
      jsdocMetadata.category ?? (pathParts.length > 1 ? pathParts[0] : 'unknown');
    const subcategory: string =
      jsdocMetadata.subcategory ?? (pathParts.length > 2 ? pathParts[1] : '');
    // Extraire le nom du composant depuis l'interface (MetricCardProps → MetricCard)
    const name = interfaceName.replace(/Props$/, '');

    // Générer un ID unique basé sur le chemin
    const id = relativePath
      .replace(/\.astro$/, '')
      .replace(/\/Default$/, '')
      .replace(/\//g, '-');

    // Utiliser la description JSDoc ou générer une par défaut
    const description =
      jsdocMetadata.description ??
      `Composant ${interfaceName} de type ${category}${subcategory ? ` (${subcategory})` : ''}`;

    // Analyser les props
    const props = this.parseProps(propsContent);

    // Utiliser les tags JSDoc ou générer des tags par défaut
    const tags: string[] = jsdocMetadata.tags ?? this.generateDefaultTags(category, name, content);

    // Utiliser les useCases JSDoc ou générer des useCases par défaut
    const useCases: string[] = jsdocMetadata.useCases ?? this.generateDefaultUseCases(category);

    const resultDef: ComponentDefinition = {
      id,
      name,
      category,
      subcategory,
      filePath: relativePath,
      description,
      props,
      tags,
      useCases,
    };
    if (jsdocMetadata.related) {
      resultDef.related = jsdocMetadata.related;
    }
    return resultDef;
  }

  private extractJSDocMetadata(content: string): JsdocMetadata {
    const metadata: JsdocMetadata = {};
    const jsdocMatch = JSDOC_REGEX.exec(content);

    if (jsdocMatch) {
      const jsdoc = jsdocMatch[1];

      // Extraire les tags JSDoc - regex simplifiée et robuste
      const tagMatches = Array.from(jsdoc.matchAll(/@(\w+)\s+([^\n*]+)/g));

      for (const match of tagMatches) {
        const tagName = match[1];
        const tagValue = match[2].replace(/\*\s*/g, '').trim();

        // Traitement spécial pour certains tags
        if (tagName === 'tags') {
          metadata.tags = tagValue.split(',').map(v => v.trim());
        } else if (tagName === 'useCases') {
          metadata.useCases = tagValue.split(',').map(v => v.trim());
        } else if (tagName === 'related') {
          metadata.related = tagValue.split(',').map(v => v.trim());
        } else if (tagName === 'category') {
          metadata.category = tagValue;
        } else if (tagName === 'subcategory') {
          metadata.subcategory = tagValue;
        } else if (tagName === 'description') {
          metadata.description = tagValue;
        }
      }
    }

    return metadata;
  }

  private parseProps(propsContent: string): Record<string, PropDefinition> {
    const props: Record<string, PropDefinition> = {};

    // Regex pour extraire chaque prop avec son type et commentaire
    const propRegex = /(\w+)(\?)?:\s*([^;]+)(?:;\s*(?:\/\/\s*(.*))?)?/g;
    let match: RegExpExecArray | null;

    while ((match = propRegex.exec(propsContent)) !== null) {
      const name = match[1];
      const optional = !!match[2];
      const type = match[3].trim();
      const comment = match[4]?.trim();

      // Chercher une valeur par défaut dans le type (pour les unions avec undefined)
      let defaultValue: string | undefined;
      if (type.includes('=')) {
        const defaultMatch = DEFAULT_VALUE_REGEX.exec(type);
        defaultValue = defaultMatch ? defaultMatch[1].trim() : undefined;
      }

      props[name] = {
        type,
        required: !optional,
        ...(defaultValue && { default: defaultValue }),
        ...(comment && { description: comment }),
      };
    }

    return props;
  }

  private generateDefaultTags(category: string, name: string, content: string): string[] {
    // Générer des tags par défaut basés sur la catégorie et le nom
    const tags = [category.toLowerCase()];

    // Ajouter le nom comme tag
    tags.push(name.toLowerCase());

    // Ajouter des tags basés sur des mots-clés courants dans le contenu
    const keywords = ['chart', 'graph', 'visualization', 'dashboard', 'report', 'analytics'];
    for (const keyword of keywords) {
      if (content.toLowerCase().includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)]; // Éliminer les doublons
  }

  private generateDefaultUseCases(category: string): string[] {
    // Générer des cas d'utilisation par défaut basés sur la catégorie
    const useCaseMap: Record<string, string[]> = {
      metrics: ['dashboard', 'reporting', 'performance-tracking'],
      mindmaps: ['concept-explanation', 'knowledge-organization'],
      process: ['workflow-visualization', 'step-by-step-guide'],
      timelines: ['project-planning', 'historical-overview'],
      matrices: ['decision-making', 'prioritization'],
      journeys: ['user-experience', 'customer-journey'],
      networks: ['relationship-mapping', 'ecosystem-visualization'],
      comparisons: ['option-evaluation', 'competitive-analysis'],
    };

    return useCaseMap[category.toLowerCase()] ?? ['general-visualization'];
  }

  private async writeComponentsJson(components: ComponentDefinition[]): Promise<void> {
    if (!this.options.outputFile) {
      return;
    }

    const json = {
      components,
      generatedAt: new Date().toISOString(),
      totalCount: components.length,
      ...(this.options.tenantId && { tenantId: this.options.tenantId }),
    };

    // Créer le répertoire de sortie s'il n'existe pas
    const outputDir = path.dirname(this.options.outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(this.options.outputFile, JSON.stringify(json, null, 2), 'utf-8');

    this.logger.log(`Component JSON written to ${this.options.outputFile}`);
  }
}
