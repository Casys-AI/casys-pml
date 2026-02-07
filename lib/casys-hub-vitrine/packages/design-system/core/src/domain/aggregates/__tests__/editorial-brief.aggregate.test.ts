import { describe, expect, it, vi } from 'vitest';

import type { CreateEditorialBriefCommand } from '../../types/editorial-brief.types';
import { EditorialBrief } from '../editorial-brief.aggregate';

describe('EditorialBrief - V3.1 Section Constraints', () => {
  const baseCommand: CreateEditorialBriefCommand = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    language: 'fr',
    angle: 'Angle de test',
    businessContext: {
      targetAudience: 'Developers',
      industry: 'Tech',
      businessDescription: 'Test business',
      contentType: 'article',
    },
    corpusTopicIds: ['topic-1'],
    keywordTags: [{ label: 'test', slug: 'test', source: 'opportunity' }],
  };

  describe('Validation des contraintes structurelles', () => {
    it('accepte targetSectionsCount valide (1-15)', () => {
      const validCounts = [1, 5, 9, 15];

      validCounts.forEach((count) => {
        expect(() => {
          EditorialBrief.create({
            ...baseCommand,
            targetSectionsCount: count,
          });
        }).not.toThrow();
      });
    });

    it('rejette targetSectionsCount < 1', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetSectionsCount: 0,
        });
      }).toThrow('targetSectionsCount must be an integer between 1 and 15');
    });

    it('rejette targetSectionsCount > 15', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetSectionsCount: 16,
        });
      }).toThrow('targetSectionsCount must be an integer between 1 and 15');
    });

    it('rejette targetSectionsCount non-entier', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetSectionsCount: 7.5,
        });
      }).toThrow('targetSectionsCount must be an integer between 1 and 15');
    });

    it('accepte targetCharsPerSection valide (300-3000)', () => {
      const validChars = [300, 1000, 1500, 3000];

      validChars.forEach((chars) => {
        expect(() => {
          EditorialBrief.create({
            ...baseCommand,
            targetCharsPerSection: chars,
          });
        }).not.toThrow();
      });
    });

    it('rejette targetCharsPerSection < 300', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetCharsPerSection: 299,
        });
      }).toThrow('targetCharsPerSection must be an integer between 300 and 3000');
    });

    it('rejette targetCharsPerSection > 3000', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetCharsPerSection: 3001,
        });
      }).toThrow('targetCharsPerSection must be an integer between 300 and 3000');
    });

    it('rejette targetCharsPerSection non-entier', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetCharsPerSection: 1000.5,
        });
      }).toThrow('targetCharsPerSection must be an integer between 300 and 3000');
    });

    it('accepte les contraintes undefined (optionnelles)', () => {
      expect(() => {
        EditorialBrief.create({
          ...baseCommand,
          targetSectionsCount: undefined,
          targetCharsPerSection: undefined,
        });
      }).not.toThrow();
    });
  });

  describe('Warning pour articles trop longs', () => {
    it('log un warning si total > 30k chars', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 15,
        targetCharsPerSection: 2500, // 15 * 2500 = 37500 > 30000
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total article length')
      );

      consoleSpy.mockRestore();
    });

    it('ne log pas de warning si total <= 30k chars', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 10,
        targetCharsPerSection: 3000, // 10 * 3000 = 30000 (limite exacte)
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Getters et toObject()', () => {
    it('expose targetSectionsCount via getter', () => {
      const brief = EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 7,
      });

      expect(brief.targetSectionsCount).toBe(7);
    });

    it('expose targetCharsPerSection via getter', () => {
      const brief = EditorialBrief.create({
        ...baseCommand,
        targetCharsPerSection: 1200,
      });

      expect(brief.targetCharsPerSection).toBe(1200);
    });

    it('retourne undefined si contraintes non spécifiées', () => {
      const brief = EditorialBrief.create(baseCommand);

      expect(brief.targetSectionsCount).toBeUndefined();
      expect(brief.targetCharsPerSection).toBeUndefined();
    });

    it('inclut les contraintes dans toObject()', () => {
      const brief = EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 8,
        targetCharsPerSection: 1500,
      });

      const obj = brief.toObject();

      expect(obj.targetSectionsCount).toBe(8);
      expect(obj.targetCharsPerSection).toBe(1500);
    });

    it('toObject() préserve undefined pour contraintes absentes', () => {
      const brief = EditorialBrief.create(baseCommand);

      const obj = brief.toObject();

      expect(obj.targetSectionsCount).toBeUndefined();
      expect(obj.targetCharsPerSection).toBeUndefined();
    });
  });

  describe('Cas d\'usage réels', () => {
    it('cas article standard: 7 sections × 1000 chars', () => {
      const brief = EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 7,
        targetCharsPerSection: 1000,
      });

      expect(brief.targetSectionsCount).toBe(7);
      expect(brief.targetCharsPerSection).toBe(1000);
      // Total: 7000 chars (< 30k, OK)
    });

    it('cas guide détaillé: 12 sections × 1500 chars', () => {
      const brief = EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 12,
        targetCharsPerSection: 1500,
      });

      expect(brief.targetSectionsCount).toBe(12);
      expect(brief.targetCharsPerSection).toBe(1500);
      // Total: 18000 chars (< 30k, OK)
    });

    it('cas article court: 5 sections × 600 chars', () => {
      const brief = EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 5,
        targetCharsPerSection: 600,
      });

      expect(brief.targetSectionsCount).toBe(5);
      expect(brief.targetCharsPerSection).toBe(600);
      // Total: 3000 chars (< 30k, OK)
    });

    it('cas pillar article: 15 sections × 2000 chars (warning attendu)', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const brief = EditorialBrief.create({
        ...baseCommand,
        targetSectionsCount: 15,
        targetCharsPerSection: 2000,
      });

      expect(brief.targetSectionsCount).toBe(15);
      expect(brief.targetCharsPerSection).toBe(2000);
      // Total: 30000 chars (limite exacte, pas de warning)
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
