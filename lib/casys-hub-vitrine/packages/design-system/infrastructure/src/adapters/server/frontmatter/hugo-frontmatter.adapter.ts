import type { ProjectConfig } from '@casys/shared';
import type { ArticleStructure, FrontmatterGeneratorPort, GeneratedFrontmatter } from '@casys/core';

import { ensureExtension, resolveContentFormat } from '../../../utils/content-format';
import { buildBodyFromSections, serializeTomlObject } from '../../../utils/mdx-utils';
import { buildCanonicalFrontmatter } from './canonical-builder';
import { applyProfileToCanonical } from './profile-applier';
import { loadFrontmatterProfile } from './profile-registry';

export class HugoFrontmatterAdapter implements FrontmatterGeneratorPort {
  readonly target = 'hugo' as const;

  async generate(article: ArticleStructure, project: ProjectConfig): Promise<GeneratedFrontmatter> {
    // Profil requis via registry; message explicite pour custom
    const profileName = project.publication?.frontmatter?.profile?.trim();
    if (profileName === 'custom') {
      throw new Error(
        '[HugoFrontmatterAdapter] profil "custom" non supporté sans template renderer'
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
        '[HugoFrontmatterAdapter] frontmatter.mirrors est supprimé. Utilisez $ref dans frontmatter.fields.'
      );
    }

    const desc = article.article.description?.trim();
    if (!desc) {
      throw new Error('[HugoFrontmatterAdapter] description/excerpt requis depuis Outline');
    }
    const canonical = buildCanonicalFrontmatter(article, project, {
      excerpt: desc,
    });
    if (!profileName) {
      throw new Error('[HugoFrontmatterAdapter] profil frontmatter requis');
    }
    const blueprint = await loadFrontmatterProfile(this.target, profileName);

    const extraFields = project.publication?.frontmatter?.fields ?? {};
    const targetFm = applyProfileToCanonical(canonical, blueprint, extraFields);

    const toml = serializeTomlObject(targetFm);
    const body = buildBodyFromSections(article);

    const content = `+++\n${toml}\n+++\n\n${body}\n`;
    const format = resolveContentFormat(project); // fail-fast si mdx sur Hugo
    const fileName = ensureExtension(canonical.slug, format);

    return {
      content,
      fileName,
      format,
      meta: { canonicalUrl: canonical.canonical, slug: canonical.slug },
    };
  }
}
