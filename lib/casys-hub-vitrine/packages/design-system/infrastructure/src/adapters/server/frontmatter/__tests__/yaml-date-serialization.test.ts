import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { serializeYamlObject } from '../../../../utils/mdx-utils';

describe('serializeYamlObject - dates', () => {
  it('doit sérialiser publishDate sans guillemets et être parsé en Date par js-yaml', () => {
    const iso = '2025-08-21T10:41:00.000Z';
    const obj = {
      title: 'Test',
      publishDate: iso,
      tags: ['a', 'b'],
      metadata: { canonical: 'https://example.com/test' },
    } as const;

    const yml = serializeYamlObject(obj);

    // Vérifie l'absence de guillemets autour de la date
    expect(yml).toMatch(new RegExp(`^publishDate:\\s+${iso}$`, 'm'));
    expect(yml).not.toMatch(new RegExp(`^publishDate:\\s+"${iso}"$`, 'm'));

    // Vérifie que js-yaml parse en Date
    const parsed = yaml.load(yml) as any;
    expect(parsed.publishDate instanceof Date).toBe(true);
    expect((parsed.publishDate as Date).toISOString()).toBe(iso);
  });
});
