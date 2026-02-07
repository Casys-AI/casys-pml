import { describe, expect, it } from 'vitest';

import type { CanonicalFrontmatter } from '../canonical-builder';
import { applyProfileToCanonical } from '../profile-applier';
import type { FrontmatterProfile } from '../profile-registry';

const baseCanonical: CanonicalFrontmatter = {
  title: 'Hello World',
  publishDate: '2025-01-02T03:04:05.000Z',
  slug: 'hello-world-abcdef12',
  canonical: 'https://example.com/hello-world-abcdef12',
  tags: ['news', 'tech'],
  excerpt: 'First section content excerpt',
  draft: false,
};

const sampleProfile: FrontmatterProfile = {
  name: 'sample',
  target: 'astro',
  required: ['title', 'publishDate', 'slug', 'canonical'],
  mapping: {
    title: 'title',
    publishDate: 'date',
    excerpt: 'summary',
    tags: 'tags',
    canonical: 'metadata.canonical',
  },
  defaults: {
    draft: false,
    'metadata.layout': 'post',
  },
};

describe('applyProfileToCanonical - fields $ref and priority', () => {
  it('applique defaults, mapping puis fields avec $ref (fields > mapping > defaults)', () => {
    const fields = {
      // copie des canoniques vers des clés cibles au choix via $ref
      description: { $ref: 'excerpt' },
      keywords: { $ref: 'tags' },
      // override explicite d’une clé mappée
      title: 'Custom Title',
      // ajout d’un champ libre non présent dans le mapping
      author: 'John Doe',
    } as Record<string, unknown>;

    const result = applyProfileToCanonical(baseCanonical, sampleProfile, fields);

    // defaults présents
    expect(result).toMatchObject({
      draft: false,
      metadata: { layout: 'post', canonical: baseCanonical.canonical },
    });

    // mapping appliqué (hors title qui est écrasé par fields ensuite)
    // ATTENTION: les $ref de fields sur excerpt et tags REMPLACENT les sorties du mapping
    // pour ces canoniques; on ne doit donc PLUS avoir summary/tags.
    expect(result).toMatchObject({
      date: baseCanonical.publishDate,
    });
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('tags');

    // fields écrase et ajoute
    expect(result).toMatchObject({
      title: 'Custom Title', // override
      description: baseCanonical.excerpt, // $ref
      keywords: baseCanonical.tags, // $ref
      author: 'John Doe', // ajout libre
    });
  });

  it('échoue en fail-fast si $ref inconnu', () => {
    expect(() =>
      applyProfileToCanonical(baseCanonical, sampleProfile, { foo: { $ref: 'unknown' } as any })
    ).toThrow(/\$ref inconnu: unknown/);
  });

  it('duplique via $ref multi-cibles (aliasing) sans redondance', () => {
    const fields = {
      description: { $ref: 'excerpt' },
      summary2: { $ref: 'excerpt' },
      keywords: { $ref: 'tags' },
      subject: { $ref: 'tags' },
    } as Record<string, unknown>;

    const res = applyProfileToCanonical(baseCanonical, sampleProfile, fields);
    // Les alias via $ref remplacent les cibles du mapping pour les mêmes canoniques
    expect(res).toMatchObject({
      description: baseCanonical.excerpt,
      summary2: baseCanonical.excerpt,
      keywords: baseCanonical.tags,
      subject: baseCanonical.tags,
    });
    expect(res).not.toHaveProperty('summary');
    expect(res).not.toHaveProperty('tags');
  });
});
