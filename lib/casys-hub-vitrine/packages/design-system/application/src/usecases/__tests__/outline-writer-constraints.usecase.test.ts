import { beforeEach, describe, expect, it, type Mock,vi } from 'vitest';

import type { ProjectConfig } from '@casys/shared';

import type { OutlineWriterCommand } from '../../commands/outline-writer.command';
import type { OutlineWriterPort, ProjectConfigPort,PromptTemplatePort } from '../../ports/out';
import type { ArticleOutline } from '../../schemas/agents/outline-writer.schemas';
import { OutlineWriterUseCase } from '../outline-writer.usecase';

// Mock logger module
vi.mock('../../utils/logger', () => ({
  applicationLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import mocked logger
import { applicationLogger as mockLogger } from '../../utils/logger';

describe('OutlineWriterUseCase - V3.1 Section Constraints', () => {
  let useCase: OutlineWriterUseCase;
  let mockOutlineWriter: OutlineWriterPort;
  let mockTemplatePort: PromptTemplatePort;
  let mockConfigPort: ProjectConfigPort;

  const baseOutline: ArticleOutline = {
    title: 'Test Article',
    summary: 'Test summary',
    slug: 'test-article',
    keywordTags: [{ label: 'test', slug: 'test' }],
    sections: [],
  };

  beforeEach(() => {
    // Clear all logger mocks
    vi.clearAllMocks();

    mockOutlineWriter = {
      generateOutline: vi.fn().mockResolvedValue(baseOutline),
    };

    mockTemplatePort = {
      loadTemplate: vi.fn().mockResolvedValue('<poml>template</poml>'),
    };

    mockConfigPort = {
      getProjectConfig: vi.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        generation: {
          outlineWriter: {
            template: 'outline-writer.poml',
            maxSections: 10,
            targetCharsPerSection: 1200,
          },
        },
      } as ProjectConfig),
    };

    useCase = new OutlineWriterUseCase(
      mockConfigPort,
      mockTemplatePort,
      mockOutlineWriter
    );
  });

  describe('Triple précédence: Brief > Config > Defaults', () => {
    const baseCommand: OutlineWriterCommand & { tenantId: string; projectId: string } = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      articleId: 'article-1',
      topics: [{ id: 'topic-1', title: 'Test Topic', createdAt: new Date().toISOString() }],
      language: 'fr',
    };

    it('utilise contraintes du Brief si présentes (priorité 1)', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 7,
          targetCharsArticle: 8400, // 7 sections × ~1200 chars
        } as any,
      };

      const outline = {
        ...baseOutline,
        sections: Array(7).fill(null).map((_, i) => ({
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      await useCase.execute(command);

      // Vérifier que les logs debug montrent la source 'brief'
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Article constraints'),
        expect.objectContaining({
          source: 'brief',
          targetSectionsCount: 7,
          targetCharsArticle: 8400,
        })
      );
    });

    it('utilise contraintes de Config si Brief vide (priorité 2)', async () => {
      const command = baseCommand;

      const config: Partial<ProjectConfig> = {
        generation: {
          tone: 'professionnel',
          length: '1000-1500',
          outlineWriter: {
            template: 'outline-writer.poml',
            maxSections: 10,
            targetCharsArticle: 15000, // 10 sections × ~1500 chars
          },
        },
      };

      (mockConfigPort.getProjectConfig as Mock).mockResolvedValue(config);

      const outline = {
        ...baseOutline,
        sections: Array(10).fill(null).map((_, i) => ({
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      await useCase.execute(command);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Article constraints'),
        expect.objectContaining({
          source: 'config',
          targetSectionsCount: 10,
          targetCharsArticle: 15000,
        })
      );
    });

    it('utilise Defaults si Brief et Config vides (priorité 3)', async () => {
      const command = baseCommand;

      (mockConfigPort.getProjectConfig as Mock).mockResolvedValue({
        generation: {
          outlineWriter: {
            template: 'outline-writer.poml',
          },
        },
      });

      const outline = {
        ...baseOutline,
        sections: Array(9).fill(null).map((_, i) => ({
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      await useCase.execute(command);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Article constraints'),
        expect.objectContaining({
          source: 'config', // config null donc defaults
          targetSectionsCount: 9, // Défaut
          targetCharsArticle: undefined, // Pas de défaut pour targetCharsArticle
        })
      );
    });

    it('Brief surcharge Config (precedence test)', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 5, // Brief: 5
          targetCharsArticle: 4000, // Brief: 4000 chars (5 sections × ~800)
        } as any,
      };

      const config: Partial<ProjectConfig> = {
        generation: {
          tone: 'professionnel',
          length: '1000-1500',
          outlineWriter: {
            template: 'outline-writer.poml',
            maxSections: 12, // Config: 12 (doit être ignoré)
            targetCharsArticle: 18000, // Config: 18000 (doit être ignoré)
          },
        },
      };

      (mockConfigPort.getProjectConfig as Mock).mockResolvedValue(config);

      const outline = {
        ...baseOutline,
        sections: Array(5).fill(null).map((_, i) => ({
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      await useCase.execute(command);

      // Vérifier que Brief a la priorité
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Article constraints'),
        expect.objectContaining({
          source: 'brief',
          targetSectionsCount: 5, // Brief wins
          targetCharsArticle: 4000, // Brief wins
        })
      );
    });
  });

  describe('Validation post-génération NON-BLOQUANTE', () => {
    const baseCommand: OutlineWriterCommand & { tenantId: string; projectId: string } = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      articleId: 'article-1',
      topics: [{ id: 'topic-1', title: 'Test Topic', createdAt: new Date().toISOString() }],
      language: 'fr',
      editorialBriefData: {
        targetSectionsCount: 7,
        targetCharsArticle: 7000, // 7 sections × ~1000 chars
      } as any,
    };

    it('pas de warning si count exact', async () => {
      const outline = {
        ...baseOutline,
        sections: Array(7).fill(null).map((_, i) => ({
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      const result = await useCase.execute(baseCommand);

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.sections.length).toBe(7);
    });

    it('warning léger si déviation 10-20% (non-bloquant)', async () => {
      const outline = {
        ...baseOutline,
        sections: Array(8).fill(null).map((_, i) => ({
          // 8 au lieu de 7 = 14% déviation
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      const result = await useCase.execute(baseCommand);

      // ✅ Génération continue (pas d'erreur)
      expect(result).toBeDefined();
      expect(result.sections.length).toBe(8);

      // ⚠️ Warning émis
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/deviates 14\.\d% from target/)
      );
    });

    it('warning significatif si déviation > 20% (non-bloquant)', async () => {
      const outline = {
        ...baseOutline,
        sections: Array(12).fill(null).map((_, i) => ({
          // 12 au lieu de 7 = 71% déviation
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      const result = await useCase.execute(baseCommand);

      // ✅ Génération continue (JAMAIS de throw)
      expect(result).toBeDefined();
      expect(result.sections.length).toBe(12);

      // ⚠️ Warning significatif émis
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/⚠️ SIGNIFICANT DEVIATION/)
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/Consider adjusting prompt/)
      );
    });

    it('pas de warning si déviation < 10%', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 10,
          targetCharsArticle: 10000, // 10 sections × ~1000 chars
        } as any,
      };

      const outline = {
        ...baseOutline,
        sections: Array(11).fill(null).map((_, i) => ({
          // 11 au lieu de 10 = 10% déviation exacte
          id: `section-${i}`,
          title: `Section ${i}`,
          level: 2,
          content: '',
          position: i,
          articleId: 'article-1',
        })),
      };

      (mockOutlineWriter.generateOutline as Mock).mockResolvedValue(outline);

      const result = await useCase.execute(command);

      expect(result).toBeDefined();
      expect(mockLogger.warn).not.toHaveBeenCalled(); // < 10% = silence
    });
  });

  describe('Validation des contraintes en entrée', () => {
    const baseCommand: OutlineWriterCommand & { tenantId: string; projectId: string } = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      articleId: 'article-1',
      topics: [{ id: 'topic-1', title: 'Test Topic', createdAt: new Date().toISOString() }],
      language: 'fr',
    };

    it('rejette targetSectionsCount < 1', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 0,
        } as any,
      };

      await expect(useCase.execute(command)).rejects.toThrow(
        'targetSectionsCount must be between 1 and 15'
      );
    });

    it('rejette targetSectionsCount > 15', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 20,
        } as any,
      };

      await expect(useCase.execute(command)).rejects.toThrow(
        'targetSectionsCount must be between 1 and 15'
      );
    });

    it('rejette targetCharsArticle < 300', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 7,
          targetCharsArticle: 100, // Too small
        } as any,
      };

      await expect(useCase.execute(command)).rejects.toThrow(
        'targetCharsArticle must be between 300 and 45000'
      );
    });

    it('rejette targetCharsArticle > 45000', async () => {
      const command = {
        ...baseCommand,
        editorialBriefData: {
          targetSectionsCount: 7,
          targetCharsArticle: 50000, // Too large
        } as any,
      };

      await expect(useCase.execute(command)).rejects.toThrow(
        'targetCharsArticle must be between 300 and 45000'
      );
    });
  });
});
