// Import du module à mocker
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ArticleStructure } from '@casys/core';

import { type MdxParserService } from '../../../parsers/mdx-parser.adapter';
import { MdxArticleStructureRepository } from '../mdx-article-structure.repository';

// Mock des modules ESM
vi.mock('node:fs/promises', async () => {
  return {
    stat: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  };
});

// Mock du MdxParserService
vi.mock('../../../parsers/mdx-parser.service');

describe('MdxArticleStructureRepository', () => {
  let repository: MdxArticleStructureRepository;
  let mockMdxParser: MdxParserService;

  const mockRootDir = '/test/articles';

  beforeEach(() => {
    // Reset des mocks
    vi.resetAllMocks();

    mockMdxParser = {
      parseArticleStructure: vi.fn(),
    } as unknown as MdxParserService;

    repository = new MdxArticleStructureRepository(mockRootDir, mockMdxParser);
  });

  describe('findByPath', () => {
    it('should use MdxParserService correctly', async () => {
      // Arrange
      const tenantId = 'tenant1';
      const projectId = 'project1';
      const fileName = 'test-article.mdx';

      const mockArticleStructure: ArticleStructure = {
        article: {
          id: 'test-article',
          title: 'Test Article',
          description: 'Test description',
          language: 'fr',
          createdAt: '2024-01-01T00:00:00Z',
          keywords: [],
          sources: [],
          agents: [],
          tags: [],
          tenantId,
          projectId,
          content: '# Test Content',
        },
        sections: [],
        componentUsages: [],
        textFragments: [],
        comments: [],
      };

      (mockMdxParser.parseArticleStructure as any).mockResolvedValue(mockArticleStructure);

      // Configure le mock pour simuler que le fichier existe
      (fs.stat as any).mockResolvedValue({ isFile: () => true } as any);

      // Act
      const result = await repository.findByPath(tenantId, projectId, fileName);

      // Assert
      expect(result).toEqual(mockArticleStructure);
      expect(mockMdxParser.parseArticleStructure).toHaveBeenCalledWith(
        join(mockRootDir, tenantId, projectId, fileName),
        tenantId,
        projectId
      );
    });

    it('should return null if file does not exist', async () => {
      // Arrange
      (fs.stat as any).mockRejectedValue(new Error('File not found'));

      // Act
      const result = await repository.findByPath('tenant1', 'project1', 'nonexistent.mdx');

      // Assert
      expect(result).toBeNull();
      expect(mockMdxParser.parseArticleStructure).not.toHaveBeenCalled();
    });

    it('should return null if MdxParser throws error', async () => {
      // Arrange
      (fs.stat as any).mockResolvedValue({ isFile: () => true } as any);

      (mockMdxParser.parseArticleStructure as any).mockRejectedValue(new Error('Parsing failed'));

      // Act
      const result = await repository.findByPath('tenant1', 'project1', 'invalid.mdx');

      // Assert
      expect(result).toBeNull();
      expect(mockMdxParser.parseArticleStructure).toHaveBeenCalled();
    });
  });

  describe('Interface compatibility', () => {
    it('should call MdxParserService with correct signature', () => {
      // Vérification TypeScript : si ça compile, c'est bon !
      const filePath = '/test/path/file.mdx';

      // Configure le mock pour retourner une valeur
      (mockMdxParser.parseArticleStructure as any).mockResolvedValue({} as ArticleStructure);

      // Cette ligne ne doit pas causer d'erreur TypeScript
      const promise = mockMdxParser.parseArticleStructure(filePath, 'tenant', 'project');

      expect(promise).toBeDefined();
    });
  });
});
