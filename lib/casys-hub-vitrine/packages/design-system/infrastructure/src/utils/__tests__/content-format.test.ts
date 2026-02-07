import { describe, expect, it } from 'vitest';

import type { ProjectConfig } from '@casys/shared';

import {
  ensureExtension,
  generateFileNameFromArticleWithFormat,
  resolveContentFormat,
} from '../content-format';

function makeProject(partial: Partial<ProjectConfig>): ProjectConfig {
  // valeurs minimales et sûres pour ProjectConfig
  const base: ProjectConfig = {
    name: 'test-project',
    type: 'astro',
    language: 'fr',
    sources: {},
    publication: { canonicalBaseUrl: 'https://example.com' },
    generation: { tone: 'professionnel', length: '800-1200' },
    schedule: { enabled: false },
    security: undefined,
  };
  return {
    ...base,
    ...partial,
    publication: { ...base.publication, ...(partial.publication ?? {}) },
  } as ProjectConfig;
}

describe('resolveContentFormat()', () => {
  it('choisit mdx par défaut pour astro', () => {
    const p = makeProject({ type: 'astro' });
    expect(resolveContentFormat(p)).toBe('mdx');
  });

  it('choisit md par défaut pour hugo', () => {
    const p = makeProject({ type: 'hugo' });
    expect(resolveContentFormat(p)).toBe('md');
  });

  it('choisit md par défaut pour wordpress', () => {
    const p = makeProject({ type: 'wordpress' });
    expect(resolveContentFormat(p)).toBe('md');
  });

  it('respecte l’override publication.content_format', () => {
    const p = makeProject({ type: 'astro', publication: { content_format: 'md' } });
    expect(resolveContentFormat(p)).toBe('md');
  });

  it('prend en compte le legacy publication.file_system.format si content_format absent', () => {
    const p = makeProject({
      type: 'astro',
      publication: { file_system: { enabled: true, content_path: '.', format: 'md' } },
    });
    expect(resolveContentFormat(p)).toBe('md');
  });

  it('fail-fast: mdx interdit pour hugo', () => {
    const p = makeProject({ type: 'hugo', publication: { content_format: 'mdx' } });
    expect(() => resolveContentFormat(p)).toThrowError(/hugo.*mdx/i);
  });

  it('ignore les valeurs invalides dans content_format', () => {
    const p = makeProject({ type: 'astro', publication: { content_format: 'invalid' as any } });
    expect(resolveContentFormat(p)).toBe('mdx'); // fallback astro
  });

  it('ignore les valeurs null/undefined', () => {
    const p = makeProject({ type: 'hugo', publication: { content_format: null as any } });
    expect(resolveContentFormat(p)).toBe('md'); // fallback hugo
  });

  it('priorité: content_format > file_system.format', () => {
    const p = makeProject({
      type: 'astro',
      publication: {
        content_format: 'md',
        file_system: { enabled: true, content_path: '.', format: 'mdx' },
      },
    });
    expect(resolveContentFormat(p)).toBe('md');
  });

  it('gère les valeurs en majuscules', () => {
    const p = makeProject({ type: 'astro', publication: { content_format: 'MDX' as any } });
    expect(resolveContentFormat(p)).toBe('mdx');
  });
});

describe('ensureExtension()', () => {
  it('remplace une extension existante', () => {
    expect(ensureExtension('file.mdx', 'md')).toBe('file.md');
  });

  it('ajoute une extension si absente', () => {
    expect(ensureExtension('file', 'mdx')).toBe('file.mdx');
  });

  it('gère les extensions en majuscules', () => {
    expect(ensureExtension('file.MDX', 'md')).toBe('file.md');
  });

  it('gère les noms de fichiers avec points multiples', () => {
    expect(ensureExtension('my.file.name.mdx', 'md')).toBe('my.file.name.md');
  });
});

describe('generateFileNameFromArticleWithFormat()', () => {
  it('génère un slug + extension basés sur le titre et l’id', () => {
    const id = '12345678-aaaa-bbbb-cccc-ddddeeeeefff';
    const title = 'Hello World!   ';
    const name = generateFileNameFromArticleWithFormat({ id, title }, 'mdx');
    expect(name).toBe('hello-world-12345678.mdx');
  });
});
