import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FrontmatterService, type UserProjectConfigPort } from '@casys/application';
import type { ProjectConfig } from '@casys/shared';

import { makeTestArticle } from '../../../../test/factories/article';
import { AstroFrontmatterAdapter } from '../../../frontmatter/astro-frontmatter.adapter';
import { MdxFileWriterAdapter } from '../mdx-file-writer.adapter';

const tenantId = 'tenant-test';
const projectId = 'project-test';
// Le writer écrit en flat dans ce dossier de test
const baseTmpRoot = path.join(tmpdir(), 'casys-test-articles');

async function cleanupDir(dir: string) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

describe('MdxFileWriterAdapter - slug/filename', () => {
  it('génère un nom de fichier à partir du titre (accents, ponctuation → tirets) en flat', async () => {
    await cleanupDir(baseTmpRoot);

    // FrontmatterService réel avec adaptateur Astro
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    // Config reader minimal satisfaisant le fail-fast
    const configReader: UserProjectConfigPort = {
      async getUserConfig() {
        throw new Error('not used in test');
      },
      async getProjectConfig(): Promise<ProjectConfig> {
        return {
          name: 'Test',
          type: 'astro',
          description: 'test',
          generation: { keywords: [], tone: 'neutral', length: 'short' } as any,
          publication: {
            canonicalBaseUrl: 'https://example.com',
            frontmatter: {
              profile: 'astrowind',
            },
          } as any,
        } as unknown as ProjectConfig;
      },
      async saveUserConfig() {
        /* noop */
      },
      async saveProjectConfig() {
        /* noop */
      },
      async listUsers() {
        return [];
      },
      async listUserProjects() {
        return [];
      },
    };
    const adapter = new MdxFileWriterAdapter(undefined, fmService, configReader);
    const article = makeTestArticle({ article: { tenantId, projectId } });
    // Frontmatter validation now requires keywords in article
    article.article.keywords = ['test'];

    const { filePath, success } = await adapter.writeArticleFile(article, tenantId, projectId);
    expect(success).toBe(true);

    // Vérifie l'existence du fichier
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);

    // Vérifie le nom du fichier (slug du titre)
    const filename = path.basename(filePath);
    expect(filename).toBe('elevation-l-ia-les-agents-123e4567.mdx');

    // Écrit à la racine flat (pas de sous-dossiers tenant/project)
    expect(path.dirname(filePath)).toBe(baseTmpRoot);

    // Vérifie le frontmatter contient le slug
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('slug: "elevation-l-ia-les-agents-123e4567"');
  });

  it("fallback sur l'id si pas de titre (flat)", async () => {
    await cleanupDir(baseTmpRoot);
    const fmService = new FrontmatterService(
      new Map([['astro', new AstroFrontmatterAdapter()]]) as any
    );
    const configReader: UserProjectConfigPort = {
      async getUserConfig() {
        throw new Error('not used in test');
      },
      async getProjectConfig(): Promise<ProjectConfig> {
        return {
          name: 'Test',
          type: 'astro',
          description: 'test',
          generation: { keywords: [], tone: 'neutral', length: 'short' } as any,
          publication: {
            canonicalBaseUrl: 'https://example.com',
            frontmatter: {
              profile: 'astrowind',
            },
          } as any,
        } as unknown as ProjectConfig;
      },
      async saveUserConfig() {
        /* noop */
      },
      async saveProjectConfig() {
        /* noop */
      },
      async listUsers() {
        return [];
      },
      async listUserProjects() {
        return [];
      },
    };
    const adapter = new MdxFileWriterAdapter(undefined, fmService, configReader);
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const article = makeTestArticle({ article: { id, title: '', tenantId, projectId } });
    article.article.keywords = ['test'];

    const { filePath, success } = await adapter.writeArticleFile(article, tenantId, projectId);
    expect(success).toBe(true);

    const filename = path.basename(filePath);
    // Pas de titre: on utilise uniquement le shortId
    expect(filename).toBe(`123e4567.mdx`);

    // Écrit à la racine flat (pas de sous-dossiers tenant/project)
    expect(path.dirname(filePath)).toBe(baseTmpRoot);

    // Vérifie le frontmatter contient le slug fallback sur id
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('slug: "123e4567"');
  });
});
