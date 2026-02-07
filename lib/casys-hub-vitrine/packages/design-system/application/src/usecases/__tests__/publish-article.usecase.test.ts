import { describe, it, expect, vi } from 'vitest';
import { PublishArticleUseCase } from '../publish-article.usecase';
import type { ArticlePublicationPublishPort } from '../../ports/out';
import { ApplicationEventTypes } from '@casys/shared';
import { ArticleStructure } from '@casys/core';

describe('PublishArticleUseCase', () => {
  it('should publish article to configured targets and emit event', async () => {
    // Arrange
    const mockResults = [
      { target: 'github', url: 'https://github.com/repo/article.md', success: true },
      { target: 'filesystem', path: '/path/to/article.md', success: true },
    ];

    const mockPublicationService: ArticlePublicationPublishPort = {
      publishToConfiguredTargets: vi.fn().mockResolvedValue(mockResults),
    };

    const mockEventHandler = vi.fn();
    const useCase = new PublishArticleUseCase(mockPublicationService);

    const mockStructure = {
      article: { id: 'test-article', title: 'Test Article' },
    } as ArticleStructure;

    // Act
    const results = await useCase.execute({
      structure: mockStructure,
      tenantId: 't1',
      projectId: 'p1',
      onEvent: mockEventHandler,
    });

    // Assert
    expect(mockPublicationService.publishToConfiguredTargets).toHaveBeenCalledWith(
      mockStructure,
      't1',
      'p1'
    );

    expect(mockEventHandler).toHaveBeenCalledWith({
      type: ApplicationEventTypes.ArticlePublished,
      payload: { results: mockResults },
    });

    expect(results).toEqual(mockResults);
  });

  it('should publish article without event handler', async () => {
    // Arrange
    const mockResults = [{ target: 'github', success: true }];

    const mockPublicationService: ArticlePublicationPublishPort = {
      publishToConfiguredTargets: vi.fn().mockResolvedValue(mockResults),
    };

    const useCase = new PublishArticleUseCase(mockPublicationService);

    const mockStructure = {
      article: { id: 'test-article', title: 'Test Article' },
    } as ArticleStructure;

    // Act
    const results = await useCase.execute({
      structure: mockStructure,
      tenantId: 't1',
      projectId: 'p1',
    });

    // Assert
    expect(results).toEqual(mockResults);
    expect(mockPublicationService.publishToConfiguredTargets).toHaveBeenCalledWith(
      mockStructure,
      't1',
      'p1'
    );
  });

  it('should propagate errors from publication service', async () => {
    // Arrange
    const mockPublicationService: ArticlePublicationPublishPort = {
      publishToConfiguredTargets: vi.fn().mockRejectedValue(new Error('Publication failed')),
    };

    const useCase = new PublishArticleUseCase(mockPublicationService);

    const mockStructure = {
      article: { id: 'test-article', title: 'Test Article' },
    } as ArticleStructure;

    // Act & Assert
    await expect(
      useCase.execute({
        structure: mockStructure,
        tenantId: 't1',
        projectId: 'p1',
      })
    ).rejects.toThrow('Publication failed');
  });

  it('should handle empty results from publication service', async () => {
    // Arrange
    const mockPublicationService: ArticlePublicationPublishPort = {
      publishToConfiguredTargets: vi.fn().mockResolvedValue([]),
    };

    const useCase = new PublishArticleUseCase(mockPublicationService);

    const mockStructure = {
      article: { id: 'test-article', title: 'Test Article' },
    } as ArticleStructure;

    // Act
    const results = await useCase.execute({
      structure: mockStructure,
      tenantId: 't1',
      projectId: 'p1',
    });

    // Assert
    expect(results).toEqual([]);
  });
});
