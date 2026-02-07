import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure, FrontmatterGeneratorPort, GeneratedFrontmatter } from '@casys/core';

import {
  generateFileNameFromArticleWithFormat,
  resolveContentFormat,
} from '../../../utils/content-format';
import { buildBodyFromSections, serializeYamlObject } from '../../../utils/mdx-utils';
import { buildCanonicalFrontmatter } from './canonical-builder';
import { applyProfileToCanonical } from './profile-applier';
import { loadFrontmatterProfile } from './profile-registry';

export class AstroFrontmatterAdapter implements FrontmatterGeneratorPort {
  readonly target = 'astro' as const;

  async generate(article: ArticleStructure, project: ProjectConfig): Promise<GeneratedFrontmatter> {
    // Profil requis (fail-fast) via registry; garde message explicite pour custom
    const profileName = project.publication?.frontmatter?.profile?.trim();
    if (profileName === 'custom') {
      throw new Error(
        '[AstroFrontmatterAdapter] profil "custom" non supporté sans template renderer'
      );
    }

    // Fail-fast: mirrors n'est plus supporté, utiliser $ref dans fields
    const fm = project.publication?.frontmatter as
      | {
          profile?: string;
          fields?: Record<string, unknown>;
          mirrors?: unknown;
        }
      | undefined;
    if (fm?.mirrors !== undefined) {
      throw new Error(
        '[AstroFrontmatterAdapter] frontmatter.mirrors est supprimé. Utilisez $ref dans frontmatter.fields.'
      );
    }

    const desc = article.article.description?.trim();
    if (!desc) {
      throw new Error('[AstroFrontmatterAdapter] description/excerpt requis depuis Outline');
    }
    const canonical = buildCanonicalFrontmatter(article, project, {
      excerpt: desc,
    });
    if (!profileName) {
      throw new Error('[AstroFrontmatterAdapter] profil frontmatter requis');
    }
    const blueprint = await loadFrontmatterProfile(this.target, profileName);

    const extraFields = project.publication?.frontmatter?.fields ?? {};
    const targetFm = applyProfileToCanonical(canonical, blueprint, extraFields);

    const yaml = serializeYamlObject(targetFm);
    const body = buildBodyFromSections(article);

    const content = `---\n${yaml}\n---\n\n${body}\n`;
    const format = resolveContentFormat(project);
    const fileName = generateFileNameFromArticleWithFormat(
      { id: article.article.id, title: article.article.title },
      format
    );

    return {
      content,
      fileName,
      format,
      meta: { canonicalUrl: canonical.canonical, slug: canonical.slug },
    };
  }
}
